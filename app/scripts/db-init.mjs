#!/usr/bin/env node
/**
 * Creates the working database from the pristine copy shipped with this package.
 *
 * This is the no-seed path: `npm run db:build` rebuilds from ../out/csv when you have the
 * seed generator, and this does the same job from the prebuilt file when you do not.
 * Safe to re-run — it never overwrites an existing working copy unless you pass --force.
 */
import { copyFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(APP, '.data');
const LIVE = join(DATA, 'karyavahi.db');
const PRISTINE = join(DATA, 'karyavahi.pristine.db');
const force = process.argv.includes('--force');

mkdirSync(DATA, { recursive: true });

if (!existsSync(PRISTINE)) {
  console.error(
    `No database at ${PRISTINE}.\n` +
    `If you have the seed generator, run "npm run db:build" instead to build one from ../out/csv.`,
  );
  process.exit(1);
}

if (existsSync(LIVE) && !force) {
  console.log(`Already set up: ${LIVE}`);
  console.log('Pass --force to discard your demo changes and start from the seed again.');
  process.exit(0);
}

// WAL means the database is three files; a stale journal would replay over the fresh copy.
for (const sfx of ['-wal', '-shm']) {
  try { rmSync(`${LIVE}${sfx}`); } catch { /* normally absent */ }
}
copyFileSync(PRISTINE, LIVE);
console.log(`Ready: ${LIVE}`);
console.log('Now run:  npm run dev     then open http://localhost:3000');
