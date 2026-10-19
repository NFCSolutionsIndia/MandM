import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module.js';
import { ArchiveController } from './archive.controller.js';
import { ArchiveService } from './archive.service.js';

@Module({
  imports: [StorageModule],
  controllers: [ArchiveController],
  providers: [ArchiveService],
})
export class ArchiveModule {}
