/**
 * Post-build step for GitHub Pages.
 *
 * Pages serves static files only, so two things need arranging:
 *
 *   - `404.html` is a copy of `index.html`. A deep link like `/play/scratch`
 *     has no file behind it; Pages answers with 404.html, the Angular router
 *     boots and shows the right page. Without this, refreshing mid-game 404s.
 *   - `.nojekyll` stops Pages running Jekyll, which would drop any file or
 *     folder starting with an underscore.
 */

import { copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist/flag-reveal/browser');

const indexFile = resolve(DIST, 'index.html');
if (!existsSync(indexFile)) {
  console.error(`No build output at ${indexFile} — run the build first.`);
  process.exit(1);
}

copyFileSync(indexFile, resolve(DIST, '404.html'));
writeFileSync(resolve(DIST, '.nojekyll'), '');

console.log('Prepared dist for GitHub Pages (404.html + .nojekyll)');
