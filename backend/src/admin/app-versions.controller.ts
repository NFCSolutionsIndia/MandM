import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  isAppPlatform,
  setAppVersionSchema,
  type SetAppVersionDto,
} from '../app-version/app-version.dto.js';
import { AppVersionService } from '../app-version/app-version.service.js';
import { Public } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AdminGuard } from './admin.middleware.js';

/**
 * The console's App versions page (ADM-01).
 *
 * `@Public()` exempts it from the USER guard — a customer session must never
 * reach an admin route — while `AdminGuard` applies the console's own rule.
 *
 * Every change is audit-logged by the database function that makes it, with
 * the old and new values, so there is no way to change a version from here
 * without leaving a record.
 */
@Controller('admin/v1/app-versions')
@UseGuards(AdminGuard)
@Public()
export class AppVersionsAdminController {
  constructor(private readonly versions: AppVersionService) {}

  @Get()
  async list() {
    return this.versions.list();
  }

  /** 422 for anything that is not x.y.z, or a minimum newer than the latest. */
  @Put(':platform')
  async set(
    @Param('platform') platform: string,
    @Body(new ZodValidationPipe(setAppVersionSchema, 422)) body: SetAppVersionDto,
  ) {
    if (!isAppPlatform(platform)) {
      throw new NotFoundException('Unknown platform.');
    }

    const result = await this.versions.set(platform, body);
    if (!result) throw new NotFoundException('Unknown platform.');
    return result;
  }
}
