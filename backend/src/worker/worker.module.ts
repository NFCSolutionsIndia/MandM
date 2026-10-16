import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from '../config/env.schema.js';
import { DbModule } from '../db/db.module.js';
import { CapsuleDeliveryHandler } from './capsule-delivery.handler.js';
import { DeliveryGateway } from './delivery.gateway.js';
import { JobQueueService } from './job-queue.service.js';
import { WorkerService } from './worker.service.js';

/**
 * The delivery engine as its own application.
 *
 * It imports `DbModule` and nothing of the API: no controllers, no guards, no
 * HTTP. The worker is a separate ECS service in production and this module is
 * the reason that is a deployment decision rather than a rewrite.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: '.env',
    }),
    DbModule,
  ],
  providers: [
    JobQueueService,
    DeliveryGateway,
    CapsuleDeliveryHandler,
    WorkerService,
  ],
  exports: [WorkerService, JobQueueService, CapsuleDeliveryHandler],
})
export class WorkerModule {}
