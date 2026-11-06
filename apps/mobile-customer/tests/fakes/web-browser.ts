// A fake of expo-web-browser: the test decides what the system browser returns for the authorize URL.
export interface BrowserResult {
  type: 'success' | 'cancel' | 'dismiss';
  url?: string;
}
export const opened: string[] = [];
export let respond: (url: string) => BrowserResult = () => ({ type: 'cancel' });
export function setResponder(fn: (url: string) => BrowserResult) {
  respond = fn;
}
export function reset() {
  opened.length = 0;
  respond = () => ({ type: 'cancel' });
}
export async function openAuthSessionAsync(url: string, _redirect: string) {
  opened.push(url);
  return respond(url);
}
