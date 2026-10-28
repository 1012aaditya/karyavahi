import 'server-only';
import { resolveSettingsAt, SETTINGS } from '@domain/catalog';
import type { SettingVersion } from '@domain/types';
import { settingVersions } from './repo';
import { today } from './clock';

/**
 * Which thresholds are in force, read from the database.
 *
 * src/domain/catalog.ts carries the same two versions as a literal, and that array is what the seed
 * generator and its validator use. It cannot be the app's source of truth once an administrator can
 * add a version: a row written to setting_versions would show on /settings, /findings and /state —
 * all of which already read the table — while the one place thresholds actually drive a computation
 * went on applying a value compiled into the bundle.
 *
 * So the table wins at runtime, and the fallback below only matters when there is no table to read,
 * which means the database was never built.
 */
export function settingsInForce(date: string = today()): SettingVersion {
  const versions = settingVersions();
  return versions.length > 0 ? resolveSettingsAt(versions, date) : resolveSettingsAt(SETTINGS, date);
}

/** The version governing the demo's today — what an edit starts from. */
export const currentSettings = (): SettingVersion => settingsInForce(today());
