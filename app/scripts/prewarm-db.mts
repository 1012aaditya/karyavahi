/**
 * Prepare the working database during the build, so a fresh server starts fast.
 *
 *   npx tsx --conditions=react-server scripts/prewarm-db.mts
 *
 * The shipped database is the pristine seed; the first time the app opens it, ensureExtensions()
 * adds indexes, caches, the real-data layer and the newer tables. On a small hosted instance that
 * takes most of a minute, every time the instance wakes. Running it here, at build time, leaves an
 * already-prepared working copy (.data/karyavahi.db) in the build, which `npm start` then uses as is
 * (db-init never overwrites an existing working copy). A restart on a host without a disk returns
 * to exactly this prepared copy, so the demo still resets itself.
 */
import { execFileSync } from 'node:child_process';

const started = Date.now();
execFileSync('node', ['scripts/db-init.mjs', '--force'], { stdio: 'inherit' });
const { db } = await import('../src/lib/db');
const conn = db();
// Fold the write-ahead log back into the main file so the build carries one complete database.
conn.exec('pragma wal_checkpoint(truncate)');
conn.close();
console.log(`Database prepared in ${((Date.now() - started) / 1000).toFixed(1)} s`);
