export const MAX_NAME_LENGTH = 80;

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function cleanDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validateName(value: string): string | null {
  const clean = cleanDisplayName(value);
  if (!clean) return 'Enter a name.';
  if (clean.length > MAX_NAME_LENGTH) {
    return `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}
