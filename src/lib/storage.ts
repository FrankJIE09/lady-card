export function readSaved<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private mode still works in memory. */
  }
}
export function forget(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Optional persistence. */
  }
}
