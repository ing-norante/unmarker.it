// Preferences are optional: browser storage must never gate an interaction.
export function readPreference(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // The caller retains the preference in memory for this visit.
  }
}
