import { Module } from '@nestjs/common';

import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';

@Module({
  controllers: [CalendarController],
  providers: [CalendarService],
  // Search reuses the expansion for its "Dates" section.
  exports: [CalendarService],
})
export class CalendarModule {}
