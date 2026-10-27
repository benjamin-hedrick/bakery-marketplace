// relay-compiler refuses to run when the artifact directory is missing, and a clean checkout
// has none (generated artifacts are gitignored). Create it so `npm run relay` works from scratch.
import { mkdirSync } from 'node:fs';

mkdirSync(new URL('../src/__generated__', import.meta.url), { recursive: true });
