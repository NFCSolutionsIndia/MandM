import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DbService } from '../db/db.service.js';
import type { AppPlatform, SetAppVersionDto } from './app-version.dto.js';
import { compareVersions } from './semver.js';

type Row = {
  platform: AppPlatform;
  latest_version: string;
  min_supported_version: string;
  store_url: string | null;
  release_notes: string | null;
  updated_by: string | null;
  updated_at: Date;
};

/**
 * Whether a mobile build is current, and whether it may still be used.
 *
 * Read by anybody, through the API's own connection and with no actor: the
 * one client that most needs this answer is an app too old to sign in.
 * Written only by the console, through `app_admin_set_app_version`, which
 * records the change in the audit log in the same transaction.
 */
@Injectable()
export class AppVersionService {
  constructor(private readonly db: DbService) {}

  /**
   * What the app is told. With no `current`, both flags are false: an app
   * that cannot say what it is gets the facts and no verdict.
   */
  async check(platform: AppPlatform, current: string | undefined) {
    const result = await this.db.tx((tx) =>
      tx.execute<Row>(
        sql`SELECT * FROM app_versions WHERE platform = ${platform}`,
      ),
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      platform: row.platform,
      latestVersion: row.latest_version,
      minSupportedVersion: row.min_supported_version,
      updateAvailable:
        current !== undefined && compareVersions(current, row.latest_version) < 0,
      forceUpdate:
        current !== undefined &&
        compareVersions(current, row.min_supported_version) < 0,
      storeUrl: row.store_url,
      releaseNotes: row.release_notes,
    };
  }

  /** Both platforms, for the console's App versions page. */
  async list() {
    const result = await this.db.adminTx((tx) =>
      tx.execute<Row & { updated_by_email: string | null }>(
        sql`SELECT v.*, a.email AS updated_by_email
              FROM app_versions v
              LEFT JOIN admin_users a ON a.id = v.updated_by
             ORDER BY v.platform DESC`,
      ),
    );
    return result.rows.map((row) => this.forAdmin(row, row.updated_by_email));
  }

  /** Replace one platform's row. `null` for a platform with no row. */
  async set(platform: AppPlatform, dto: SetAppVersionDto) {
    const result = await this.db.adminTx(async (tx) => {
      const updated = await tx.execute<Row>(
        sql`SELECT * FROM app_admin_set_app_version(
              ${platform}, ${dto.latestVersion}, ${dto.minSupportedVersion},
              ${dto.storeUrl}, ${dto.releaseNotes})`,
      );
      const row = updated.rows[0];
      if (!row) return null;

      const who = await tx.execute<{ email: string }>(
        sql`SELECT email FROM admin_users WHERE id = app_current_admin()`,
      );
      return this.forAdmin(row, who.rows[0]?.email ?? null);
    });
    return result;
  }

  private forAdmin(row: Row, updatedByEmail: string | null) {
    return {
      platform: row.platform,
      latestVersion: row.latest_version,
      minSupportedVersion: row.min_supported_version,
      storeUrl: row.store_url,
      releaseNotes: row.release_notes,
      updatedBy: row.updated_by
        ? { id: row.updated_by, email: updatedByEmail }
        : null,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
