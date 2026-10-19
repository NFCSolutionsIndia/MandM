import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { MailService } from './mail/mail.service.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      /**
       * Trust the load balancer's `X-Forwarded-For`.
       *
       * Behind an ALB, `req.ip` is otherwise the balancer's own address — so
       * every sign-in would be recorded as coming from the same place and the
       * audit trail would be worthless. Only safe because nothing reaches this
       * process except through the balancer.
       */
      trustProxy: true,
    }),
  );

  /**
   * Everything the apps call lives under `/api/v1`.
   *
   * Versioned from the first endpoint, not retrofitted: an app installed today
   * must still talk to this server years from now, and a native client cannot
   * be forced to update. `/health` is excluded because the load balancer asks
   * for it by a fixed path that has nothing to do with the product's API.
   */
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });

  /**
   * Let SIGTERM reach `onApplicationShutdown`, so the connection pool drains.
   *
   * ECS sends SIGTERM and waits before SIGKILL. Without this hook Nest ignores
   * the signal, the process is killed mid-transaction, and the database is left
   * to time out connections nobody is on the other end of. Every rolling deploy
   * would do it, to every container.
   */
  app.enableShutdownHooks();

  /**
   * Prove the mail credentials now, not when somebody tries to sign in.
   *
   * SMTP authentication only fails at send time, so without this the first
   * thing to discover a wrong password is a user watching a code that never
   * arrives. Deliberately not awaited into a failure: it logs loudly and the
   * API still starts, because a mail outage must not also take down reading
   * the archive.
   */
  void app.get(MailService).verify();

  // Fastify binds to 127.0.0.1 by default. Inside a container that means nothing
  // outside the container can reach it, so bind all interfaces explicitly.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
