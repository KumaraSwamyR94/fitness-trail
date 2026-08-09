import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';

import { useDataChange } from '@/data/data-change-context';
import { profileRepository } from '@/data/profile-repository';
import type { Profile } from '@/types/profile';

interface ProfileContextValue {
  profiles: Profile[];
  selectedProfile: Profile | null;
  loading: boolean;
  refreshProfiles: () => Promise<void>;
  selectProfile: (id: string) => Promise<void>;
}

const ProfileContext = React.createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: React.PropsWithChildren): React.ReactElement {
  const db = useSQLiteContext();
  const { notifyDataChanged } = useDataChange();
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refreshProfiles = React.useCallback(async () => {
    const [nextProfiles, nextSelected] = await Promise.all([
      profileRepository.list(db),
      profileRepository.getSelected(db),
    ]);
    setProfiles(nextProfiles);
    setSelectedProfile(nextSelected);
    setLoading(false);
  }, [db]);

  React.useEffect(() => {
    let active = true;
    void Promise.all([profileRepository.list(db), profileRepository.getSelected(db)]).then(
      ([nextProfiles, nextSelected]) => {
        if (!active) return;
        setProfiles(nextProfiles);
        setSelectedProfile(nextSelected);
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, [db]);

  const selectProfile = React.useCallback(async (id: string) => {
    await profileRepository.select(db, id);
    await refreshProfiles();
    notifyDataChanged();
  }, [db, notifyDataChanged, refreshProfiles]);

  const value = React.useMemo(
    () => ({ profiles, selectedProfile, loading, refreshProfiles, selectProfile }),
    [loading, profiles, refreshProfiles, selectProfile, selectedProfile],
  );
  return <ProfileContext value={value}>{children}</ProfileContext>;
}

export function useProfiles(): ProfileContextValue {
  const value = React.use(ProfileContext);
  if (!value) throw new Error('useProfiles must be used within ProfileProvider.');
  return value;
}
