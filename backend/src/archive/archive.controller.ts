import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod.pipe.js';
import { MEDIA_KIND } from '../shared/enums.js';
import {
  createMemorySchema,
  listMemoriesSchema,
  startUploadSchema,
  type CreateMemoryDto,
  type ListMemoriesDto,
  type StartUploadDto,
} from './archive.dto.js';
import { ArchiveService } from './archive.service.js';

const completeUploadSchema = z.object({
  kind: z.enum(MEDIA_KIND),
  contentType: z.string().trim().min(1).max(128),
});

/**
 * The archive endpoints the native apps call.
 *
 * Nothing here checks who may see what. The connection carries the actor and
 * sixty policies decide; a handler that re-stated the rule would be stating it
 * in a second place where it could later disagree with the first.
 */
@Controller()
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @Post('vaults/:vaultId/memories')
  @HttpCode(HttpStatus.CREATED)
  async createMemory(
    @Param('vaultId', ParseUUIDPipe) vaultId: string,
    @Body(new ZodValidationPipe(createMemorySchema)) body: CreateMemoryDto,
  ) {
    return this.archive.createMemory(vaultId, body);
  }

  @Get('vaults/:vaultId/memories')
  async listMemories(
    @Param('vaultId', ParseUUIDPipe) vaultId: string,
    @Query(new ZodValidationPipe(listMemoriesSchema)) query: ListMemoriesDto,
  ) {
    const memories = await this.archive.listMemories(
      vaultId,
      query.limit,
      query.before,
    );

    return {
      memories,
      // Keyset rather than an offset: an offset shifts under you when somebody
      // adds a memory mid-scroll, and this timeline is appended to constantly.
      nextBefore:
        memories.length === query.limit
          ? memories[memories.length - 1].occurredAt
          : null,
    };
  }

  /**
   * Start an upload. Returns a URL the client PUTs the file to directly.
   *
   * The bytes never pass through this server: a 4K video routed through a
   * request handler would hold it for minutes and a rolling deploy would
   * cancel somebody's upload.
   */
  @Post('uploads')
  @HttpCode(HttpStatus.CREATED)
  async startUpload(
    @Body(new ZodValidationPipe(startUploadSchema)) body: StartUploadDto,
  ) {
    return this.archive.startUpload(body);
  }

  /** Confirm it landed. The size is read from the store, not from the client. */
  @Post('uploads/:uploadId/complete')
  @HttpCode(HttpStatus.OK)
  async completeUpload(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Body(new ZodValidationPipe(completeUploadSchema))
    body: z.infer<typeof completeUploadSchema>,
  ) {
    return this.archive.completeUpload(uploadId, body.kind, body.contentType);
  }

  @Get('media/:assetId/url')
  async mediaUrl(@Param('assetId', ParseUUIDPipe) assetId: string) {
    return this.archive.mediaUrl(assetId);
  }
}
