import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Public } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import {
  addRecipientSchema,
  attachMemoriesSchema,
  createCapsuleSchema,
  listCapsulesSchema,
  replySchema,
  updateCapsuleSchema,
  type AddRecipientDto,
  type AttachMemoriesDto,
  type CreateCapsuleDto,
  type ListCapsulesDto,
  type ReplyDto,
  type UpdateCapsuleDto,
} from './capsules.dto.js';
import { CapsulesService } from './capsules.service.js';

/**
 * The capsule endpoints — the sender's side.
 *
 * As everywhere else here, nothing in this file decides who may see what.
 * The connection carries the actor and the policies decide.
 */
@Controller()
export class CapsulesController {
  constructor(private readonly capsules: CapsulesService) {}

  @Post('vaults/:vaultId/capsules')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('vaultId', ParseUUIDPipe) vaultId: string,
    @Body(new ZodValidationPipe(createCapsuleSchema)) body: CreateCapsuleDto,
  ) {
    return this.capsules.create(vaultId, body);
  }

  @Get('vaults/:vaultId/capsules')
  async list(
    @Param('vaultId', ParseUUIDPipe) vaultId: string,
    @Query(new ZodValidationPipe(listCapsulesSchema)) query: ListCapsulesDto,
  ) {
    return this.capsules.list(vaultId, query.limit, query.state);
  }

  @Get('capsules/:capsuleId')
  async get(@Param('capsuleId', ParseUUIDPipe) capsuleId: string) {
    return this.capsules.get(capsuleId);
  }

  @Patch('capsules/:capsuleId')
  async update(
    @Param('capsuleId', ParseUUIDPipe) capsuleId: string,
    @Body(new ZodValidationPipe(updateCapsuleSchema)) body: UpdateCapsuleDto,
  ) {
    return this.capsules.update(capsuleId, body);
  }

  @Post('capsules/:capsuleId/recipients')
  @HttpCode(HttpStatus.CREATED)
  async addRecipient(
    @Param('capsuleId', ParseUUIDPipe) capsuleId: string,
    @Body(new ZodValidationPipe(addRecipientSchema)) body: AddRecipientDto,
  ) {
    return this.capsules.addRecipient(capsuleId, body);
  }

  @Delete('capsules/:capsuleId/recipients/:recipientId')
  async removeRecipient(
    @Param('capsuleId', ParseUUIDPipe) capsuleId: string,
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
  ) {
    return this.capsules.removeRecipient(capsuleId, recipientId);
  }

  @Post('capsules/:capsuleId/memories')
  async attachMemories(
    @Param('capsuleId', ParseUUIDPipe) capsuleId: string,
    @Body(new ZodValidationPipe(attachMemoriesSchema)) body: AttachMemoriesDto,
  ) {
    return this.capsules.attachMemories(capsuleId, body);
  }

  /** The moment the product is about. */
  @Post('capsules/:capsuleId/seal')
  @HttpCode(HttpStatus.OK)
  async seal(@Param('capsuleId', ParseUUIDPipe) capsuleId: string) {
    return this.capsules.seal(capsuleId);
  }

  @Post('capsules/:capsuleId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('capsuleId', ParseUUIDPipe) capsuleId: string) {
    return this.capsules.cancel(capsuleId);
  }
}

/**
 * The recipient's side.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  `@Public()` here is the whole point, not an oversight.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The person opening a capsule may have been eleven years old when it was
 * written, may have no account, and may be reading it because the sender has
 * died. Requiring them to sign up first would put a registration form between
 * a child and a message from their mother.
 *
 * The token is the whole credential, and both of these resolve it through
 * SECURITY DEFINER functions that refuse any capsule which is not already
 * delivered — so a token obtained early opens nothing.
 */
@Controller('open')
@Public()
export class CapsuleOpenController {
  constructor(private readonly capsules: CapsulesService) {}

  @Get(':token')
  async open(@Param('token') token: string) {
    return this.capsules.open(token);
  }

  @Post(':token/reply')
  @HttpCode(HttpStatus.CREATED)
  async reply(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(replySchema)) body: ReplyDto,
  ) {
    return this.capsules.reply(token, body.body, body.mediaId);
  }
}
