import { Module } from '@nestjs/common';

import { CalendarModule } from '../calendar/calendar.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [CalendarModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
