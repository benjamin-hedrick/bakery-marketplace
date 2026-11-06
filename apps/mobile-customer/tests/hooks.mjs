import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FAKES = {
  'expo-secure-store': './fakes/secure-store.ts',
  'expo-web-browser': './fakes/web-browser.ts',
  'expo-crypto': './fakes/crypto.ts',
};

export async function resolve(specifier, context, next) {
  if (FAKES[specifier]) return { url: new URL(FAKES[specifier], import.meta.url).href, shortCircuit: true };
  const parent = context.parentURL ?? '';
  if (specifier.startsWith('.') && parent.includes('/src/')) {
    // A "?inst=n" on the importing module is passed on, so a test can load a fresh copy of the whole app module graph (the session keeps its state in module variables).
    const inst = new URL(parent).searchParams.get('inst');
    const base = new URL(specifier, parent.split('?')[0]).href;
    for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (existsSync(fileURLToPath(base + suffix))) {
        return { url: base + suffix + (inst ? `?inst=${inst}` : ''), shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}
