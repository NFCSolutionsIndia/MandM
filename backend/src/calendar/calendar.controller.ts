import { Controller, Get, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod.pipe.js';
import {
  calendarQuerySchema,
  summaryQuerySchema,
  type CalendarQueryDto,
  type SummaryQueryDto,
} from './calendar.dto.js';
import { CalendarService } from './calendar.service.js';

/**
 * The Calendar tab (BE-11). Every route needs a session, and everything comes
 * from the session's own people, events and capsules (row-level security).
 */
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /**
   * `GET /calendar?from=2026-03-01&to=2026-03-31&types=birthday,holiday&q=`
   * → `{ from, to, today, items }`, sorted by date. At most 366 days.
   *
   * Month grid: one month. List view: today to the end of the year, with
   * the filter chips as `types` and the search box as `q`.
   */
  @Get()
  async range(@Query(new ZodValidationPipe(calendarQuerySchema)) query: CalendarQueryDto) {
    return this.calendar.range(query);
  }

  /**
   * `GET /calendar/summary?year=2026&types=`
   * → `{ year, today, months: [{ month, count, days, byType }] }`, all 12 months.
   * The "Jump to" sheet's "3 dates" under each month.
   */
  @Get('summary')
  async summary(@Query(new ZodValidationPipe(summaryQuerySchema)) query: SummaryQueryDto) {
    return this.calendar.summary(query.year, query.types);
  }
}
