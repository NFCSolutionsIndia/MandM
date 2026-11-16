import { Module } from '@nestjs/common';

import { MomentsController } from './moments.controller.js';
import { MomentsService } from './moments.service.js';

@Module({
  controllers: [MomentsController],
  providers: [MomentsService],
})
export class MomentsModule {}
