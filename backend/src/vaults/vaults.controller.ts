import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ActorContext } from '../db/actor-context.js';
import { DbService } from '../db/db.service.js';
import { vaultMembers, vaults } from '../db/schema/index.js';

const createVaultSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(['personal', 'shared', 'legacy']).default('personal'),
});

/**
 * The first endpoint that is about the product rather than about plumbing.
 *
 * Worth reading for what is NOT here: no `WHERE owner_id = ?`, no check that
 * the caller belongs to the vault, no authorization code of any kind. The
 * select below is written as if the table held only this user's rows, because
 * as far as this connection is concerned it does.
 */
@Controller('vaults')
export class VaultsController {
  constructor(private readonly db: DbService) {}

  @Get()
  async list() {
    const rows = await this.db.tx((tx) => tx.select().from(vaults));

    return rows.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      defaultVisibility: v.defaultVisibility,
      createdAt: v.createdAt,
    }));
  }

  /**
   * Creating a vault is two writes that must not come apart: the vault, and
   * the owner's membership row. `DbService.tx()` wraps both in one
   * transaction, so a vault with no members cannot exist.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createVaultSchema))
    body: z.infer<typeof createVaultSchema>,
  ) {
    const actor = ActorContext.userId();

    return this.db.tx(async (tx) => {
      const [vault] = await tx
        .insert(vaults)
        .values({ ownerId: actor!, name: body.name, type: body.type })
        .returning();

      // Permitted by vault_members_insert only because app_is_vault_owner()
      // already sees the row above — within the same transaction, before it
      // is visible to anybody else.
      await tx
        .insert(vaultMembers)
        .values({ vaultId: vault.id, userId: actor!, role: 'owner' });

      return { id: vault.id, name: vault.name, type: vault.type };
    });
  }

  /** Proof that the boundary is the database's, not this handler's. */
  @Get('debug/row-counts')
  async rowCounts() {
    const result = await this.db.tx((tx) =>
      tx.execute<{ vaults: string; memories: string; users: string }>(
        sql`SELECT (SELECT count(*) FROM vaults)   AS vaults,
                   (SELECT count(*) FROM memories) AS memories,
                   (SELECT count(*) FROM users)    AS users`,
      ),
    );

    // An unqualified count of three whole tables, and it still only counts
    // what this actor may see.
    return result.rows[0];
  }
}
