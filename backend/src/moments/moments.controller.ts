import { Controller, Get, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod.pipe.js';
import { upcomingQuerySchema, type UpcomingQueryDto } from './moments.dto.js';
import { MomentsService } from './moments.service.js';

/** The Home screen (BE-06). Needs a session. */
@Controller('moments')
export class MomentsController {
  constructor(private readonly moments: MomentsService) {}

  /**
   * `GET /moments/upcoming?limit=5` → `{ items: [...] }`, soonest first,
   * ties by type then title. At most `limit` (default 5, max 20).
   */
  @Get('upcoming')
  async upcoming(
    @Query(new ZodValidationPipe(upcomingQuerySchema)) query: UpcomingQueryDto,
  ) {
    return this.moments.upcoming(query.limit, new Date(), query.types);
  }
}
