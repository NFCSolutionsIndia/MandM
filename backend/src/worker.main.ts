import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker/worker.module.js';
import { WorkerService } from './worker/worker.service.js';

/**
 * The delivery engine's entry point.
 *
 *   npm run worker:dev     watch mode
 *   node dist/worker.main.js
 *
 * A standalone application context — no HTTP server, no port. It exists to
 * claim jobs and deliver capsules, and a worker that listened on a port would
 * be one more thing to secure for no reason.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: false,
  });

  // SIGTERM reaches WorkerService.onApplicationShutdown, which stops the loop
  // after the job in hand rather than during it.
  app.enableShutdownHooks();

  const worker = app.get(WorkerService);
  await worker.start();

  await app.close();
}

void bootstrap().catch((error: Error) => {
  new Logger('Worker').error(error.message, error.stack);
  process.exitCode = 1;
});
