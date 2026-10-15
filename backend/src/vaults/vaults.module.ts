import { Module } from '@nestjs/common';

import { VaultsController } from './vaults.controller.js';

@Module({ controllers: [VaultsController] })
export class VaultsModule {}
