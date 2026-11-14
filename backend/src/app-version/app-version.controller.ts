import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';

import { Public } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import {
  appVersionQuerySchema,
  isAppPlatform,
  type AppVersionQueryDto,
} from './app-version.dto.js';
import { AppVersionService } from './app-version.service.js';

/**
 * `GET /api/v1/app-version/:platform?current=x.y.z`
 *
 * Public: an app too old to sign in is exactly the one that must be told to
 * update. It reveals nothing a store listing does not already show.
 */
@Controller('app-version')
@Public()
export class AppVersionController {
  constructor(private readonly versions: AppVersionService) {}

  /**
   * Cached for five minutes. Every launch of every app calls this, and a new
   * minimum taking up to five minutes to reach everyone is an acceptable
   * price for not hitting the database each time.
   */
  @Get(':platform')
  @Header('Cache-Control', 'public, max-age=300')
  async check(
    @Param('platform') platform: string,
    @Query(new ZodValidationPipe(appVersionQuerySchema)) query: AppVersionQueryDto,
  ) {
    if (!isAppPlatform(platform)) {
      throw new NotFoundException('Unknown platform.');
    }

    const result = await this.versions.check(platform, query.current);
    if (!result) throw new NotFoundException('Unknown platform.');
    return result;
  }
}
