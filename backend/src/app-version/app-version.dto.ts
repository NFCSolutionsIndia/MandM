import { z } from 'zod';

import { DEVICE_PLATFORM } from '../shared/enums.js';
import { compareVersions, isVersion } from './semver.js';

/**
 * Request shapes for the app-version endpoints. See `semver.ts` for why a
 * version is exactly `x.y.z`.
 */

export const APP_PLATFORMS = DEVICE_PLATFORM;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

export function isAppPlatform(value: string): value is AppPlatform {
  return (APP_PLATFORMS as readonly string[]).includes(value);
}

const version = z
  .string()
  .trim()
  .refine(isVersion, 'must be an x.y.z version, such as 1.4.0');

/** `?current=1.2.0` on the public endpoint. Optional: absent means "don't know". */
export const appVersionQuerySchema = z.object({
  current: version.optional(),
});

/**
 * The body of `PUT /admin/v1/app-versions/:platform`.
 *
 * PUT replaces the whole row, so `storeUrl` and `releaseNotes` left out are
 * cleared, not kept. The console always sends all four.
 */
export const setAppVersionSchema = z
  .object({
    latestVersion: version,
    minSupportedVersion: version,
    storeUrl: z
      .string()
      .trim()
      .url('must be a URL')
      .max(2048)
      .refine((v) => v.startsWith('https://'), 'must be an https:// URL')
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    releaseNotes: z
      .string()
      .trim()
      .max(5000, 'must be at most 5000 characters')
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .refine(
    (v) =>
      !isVersion(v.latestVersion) ||
      !isVersion(v.minSupportedVersion) ||
      compareVersions(v.minSupportedVersion, v.latestVersion) <= 0,
    {
      path: ['minSupportedVersion'],
      message: 'must not be newer than latestVersion',
    },
  );

export type AppVersionQueryDto = z.infer<typeof appVersionQuerySchema>;
export type SetAppVersionDto = z.infer<typeof setAppVersionSchema>;
