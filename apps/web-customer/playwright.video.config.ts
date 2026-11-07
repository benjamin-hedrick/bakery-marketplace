import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Records a video of every test it runs (the demo captures, scripts/dev/capture-video*): the same tests and servers as the normal config, at a
// 1280 x 720 window, with the videos under artifacts/video (git-ignored). Run it as
//   npx playwright test -c playwright.video.config.ts tests/e2e/<spec> -g "<test name>"
export default defineConfig({
  ...base,
  outputDir: '../../artifacts/video/web-customer',
  use: {
    ...base.use,
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
  },
});
