import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import type { ProfilePhoto } from '@/types/profile';

const mediaDirectory = new Directory(Paths.document, 'fitness-trail', 'profile-media');
const avatarDirectory = new Directory(Paths.document, 'fitness-trail', 'avatars', 'open-peeps-v1');

export const PROFILE_AVATAR_IDS = Array.from(
  { length: 20 },
  (_, index) => `trail-${String(index + 1).padStart(2, '0')}`,
);

export interface CachedAvatar {
  id: string;
  uri: string | null;
  error: boolean;
}

function ensureDirectory(directory: Directory): void {
  directory.create({ idempotent: true, intermediates: true });
}

function avatarFile(id: string): File {
  return new File(avatarDirectory, `${id}.png`);
}

function localPhotoFile(ref: string): File {
  return new File(Paths.document, ref);
}

export function cachedAvatarSnapshot(): CachedAvatar[] {
  ensureDirectory(avatarDirectory);
  return PROFILE_AVATAR_IDS.map((id) => {
    const file = avatarFile(id);
    return { id, uri: file.exists && file.size > 0 ? file.uri : null, error: false };
  });
}

function avatarUrl(id: string): string {
  const seed = encodeURIComponent(`fitness-trail-${id}`);
  return `https://api.dicebear.com/10.x/adventurer-neutral/png?seed=${seed}&size=256`;
}

export async function cacheMissingAvatars(
  onUpdate?: (avatars: CachedAvatar[]) => void,
): Promise<CachedAvatar[]> {
  ensureDirectory(avatarDirectory);
  const state = cachedAvatarSnapshot();
  const missing = state.filter((item) => !item.uri);
  let cursor = 0;

  const publish = () => onUpdate?.(state.map((item) => ({ ...item })));
  const worker = async () => {
    while (cursor < missing.length) {
      const item = missing[cursor++];
      const target = avatarFile(item.id);
      try {
        await File.downloadFileAsync(avatarUrl(item.id), target, { idempotent: true });
        if (!target.exists || target.size === 0)
          throw new Error('The downloaded avatar was empty.');
        const current = state.find((avatar) => avatar.id === item.id)!;
        current.uri = target.uri;
        current.error = false;
      } catch {
        if (target.exists) target.delete();
        const current = state.find((avatar) => avatar.id === item.id)!;
        current.uri = null;
        current.error = true;
      }
      publish();
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, missing.length) }, () => worker()));
  return state;
}

export async function persistProfilePhoto(sourceUri: string): Promise<ProfilePhoto> {
  ensureDirectory(mediaDirectory);
  const source = new File(sourceUri);
  const extension = /^\.[a-z0-9]{2,5}$/i.test(source.extension)
    ? source.extension.toLowerCase()
    : '.jpg';
  const filename = `${randomUUID()}${extension}`;
  const destination = new File(mediaDirectory, filename);
  await source.copy(destination);
  return { kind: 'local', ref: `fitness-trail/profile-media/${filename}` };
}

export function profilePhotoUri(photo: ProfilePhoto): string | null {
  if (photo.kind === 'avatar') {
    const file = avatarFile(photo.ref);
    return file.exists && file.size > 0 ? file.uri : null;
  }
  if (photo.kind === 'local') {
    const file = localPhotoFile(photo.ref);
    return file.exists && file.size > 0 ? file.uri : null;
  }
  return null;
}

export function removePrivateProfilePhoto(photo: ProfilePhoto): void {
  if (photo.kind !== 'local') return;
  const file = localPhotoFile(photo.ref);
  if (file.exists) file.delete();
}
