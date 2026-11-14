import { Module } from '@nestjs/common';

import { AppVersionController } from './app-version.controller.js';
import { AppVersionService } from './app-version.service.js';

/**
 * The public half. The console's half — `GET`/`PUT /admin/v1/app-versions` —
 * lives in AdminModule, so it sits behind the admin middleware with every
 * other console route, and imports this module for the service.
 */
@Module({
  controllers: [AppVersionController],
  providers: [AppVersionService],
  exports: [AppVersionService],
})
export class AppVersionModule {}
