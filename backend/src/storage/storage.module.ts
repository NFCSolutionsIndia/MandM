import { Global, Module } from '@nestjs/common';

import { StorageService } from './storage.service.js';

/**
 * Global: the worker needs it for transcode output and the API for uploads,
 * and neither should have to import it. Storage is as cross-cutting here as
 * the database.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
