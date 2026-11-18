import { Controller, Get, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod.pipe.js';
import { searchQuerySchema, type SearchQueryDto } from './search.dto.js';
import { SearchService } from './search.service.js';

/** The Search screen (BE-07). Every route needs a session. */
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /**
   * `GET /search?q=dad&types=people,memories,dates&limit=5&cursor=`
   * → `{ q, people?, memories?, dates? }`, each `{ items, nextCursor }`.
   * Only the requested sections are present. 422 when `q` is under 2 characters.
   */
  @Get()
  async find(@Query(new ZodValidationPipe(searchQuerySchema, 422)) query: SearchQueryDto) {
    return this.search.search(query);
  }
}
