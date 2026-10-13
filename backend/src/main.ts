import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Fastify binds to 127.0.0.1 by default. Inside a container that means nothing
  // outside the container can reach it, so bind all interfaces explicitly.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
