import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';

import { MailModule } from '../mail/mail.module.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminActorMiddleware } from './admin.middleware.js';

@Module({
  imports: [MailModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService],
})
export class AdminModule implements NestModule {
  /**
   * Scoped to the admin namespace only.
   *
   * Unlike `ActorMiddleware`, which runs everywhere, this one must not touch
   * the mobile API: a customer request has no business having an admin actor
   * resolved for it, even to `null`. The two realms meet nowhere.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AdminActorMiddleware).forRoutes('admin/v1/*path');
  }
}
