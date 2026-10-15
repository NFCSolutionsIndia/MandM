import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';

import { MailModule } from '../mail/mail.module.js';
import { ActorMiddleware } from './actor.middleware.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule implements NestModule {
  /**
   * Applied to **every** route, including the public ones.
   *
   * The middleware identifies; it never rejects. Running it everywhere means a
   * handler can always ask who is calling — and, more importantly, that nobody
   * has to remember to opt a new route in. A route that was accidentally left
   * out would not fail; it would silently run with no actor and return
   * nothing, which is a bug that looks like an empty database.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ActorMiddleware).forRoutes('*path');
  }
}
