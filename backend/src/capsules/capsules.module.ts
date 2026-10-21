import { Module } from '@nestjs/common';

import {
  CapsuleOpenController,
  CapsulesController,
} from './capsules.controller.js';
import { CapsulesService } from './capsules.service.js';

@Module({
  controllers: [CapsulesController, CapsuleOpenController],
  providers: [CapsulesService],
})
export class CapsulesModule {}
