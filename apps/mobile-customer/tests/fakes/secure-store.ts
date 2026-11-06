// A fake of expo-secure-store (the Android Keystore): a map, with a record of every call so a test can assert what was written and where.
export const store = new Map<string, string>();
export const calls: { op: 'get' | 'set' | 'delete'; key: string; value?: string }[] = [];
export function reset() {
  store.clear();
  calls.length = 0;
}
export async function getItemAsync(key: string) {
  calls.push({ op: 'get', key });
  return store.get(key) ?? null;
}
export async function setItemAsync(key: string, value: string) {
  calls.push({ op: 'set', key, value });
  store.set(key, value);
}
export async function deleteItemAsync(key: string) {
  calls.push({ op: 'delete', key });
  store.delete(key);
}
