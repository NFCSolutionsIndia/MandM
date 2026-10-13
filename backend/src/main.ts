import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  /**
   * Let SIGTERM reach `onApplicationShutdown`, so the connection pool drains.
   *
   * ECS sends SIGTERM and waits before SIGKILL. Without this hook Nest ignores
   * the signal, the process is killed mid-transaction, and the database is left
   * to time out connections nobody is on the other end of. Every rolling deploy
   * would do it, to every container.
   */
  app.enableShutdownHooks();

  // Fastify binds to 127.0.0.1 by default. Inside a container that means nothing
  // outside the container can reach it, so bind all interfaces explicitly.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
