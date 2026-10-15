import { Controller, Get, UseGuards } from '@nestjs/common';

import { Public } from '../auth/auth.guard.js';
import { AdminGuard } from './admin.middleware.js';
import { DashboardService } from './dashboard.service.js';

/**
 * The console's home screen, in one call.
 *
 * `@Public()` exempts it from the USER guard — a customer session must never
 * reach an admin route — while `AdminGuard` applies the console's own rule.
 */
@Controller('admin/v1/dashboard')
@UseGuards(AdminGuard)
@Public()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  async load() {
    return this.dashboard.load();
  }
}
