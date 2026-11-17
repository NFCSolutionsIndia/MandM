import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod.pipe.js';
import {
  createEventSchema,
  listEventsSchema,
  updateEventSchema,
  type CreateEventDto,
  type ListEventsDto,
  type UpdateEventDto,
} from './events.dto.js';
import { EventsService } from './events.service.js';

const Id = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/** Events: occasions a user marks, optionally about some of their people. */
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** `GET /events?type=&memberId=&q=&archived=false&cursor=&limit=20` → `{ items, nextCursor }`. */
  @Get()
  async list(@Query(new ZodValidationPipe(listEventsSchema)) query: ListEventsDto) {
    return this.events.list(query);
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createEventSchema, 422)) body: CreateEventDto) {
    return this.events.create(body);
  }

  @Get(':id')
  async get(@Param('id', Id) id: string) {
    return this.events.get(id);
  }

  /** Any subset of fields. `memberIds` replaces the whole list. */
  @Patch(':id')
  async update(
    @Param('id', Id) id: string,
    @Body(new ZodValidationPipe(updateEventSchema, 422)) body: UpdateEventDto,
  ) {
    return this.events.update(id, body);
  }

  /** Archives. 204. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id', Id) id: string) {
    await this.events.archive(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restore(@Param('id', Id) id: string) {
    return this.events.restore(id);
  }
}
