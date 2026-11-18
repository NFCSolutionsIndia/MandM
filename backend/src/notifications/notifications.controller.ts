import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod.pipe.js';
import {
  listNotificationsSchema,
  quietHoursSchema,
  type ListNotificationsDto,
  type QuietHoursDto,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

/** A malformed id names nothing: 404, the same as somebody else's. */
const Id = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/** The notification centre (BE-12). Every route needs a session. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** `GET /notifications?cursor=&limit=20&unread=false` → `{ items, nextCursor }`, newest first. */
  @Get()
  async list(@Query(new ZodValidationPipe(listNotificationsSchema)) query: ListNotificationsDto) {
    return this.notifications.list(query);
  }

  /** `{ unread }`: the red dot on Home's bell. */
  @Get('unread-count')
  async unreadCount() {
    return this.notifications.unreadCount();
  }

  /** "Mark all read" → `{ updated }`. */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async readAll() {
    return this.notifications.markAllRead();
  }

  /** Tapping one. 204, also when it was already read. */
  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@Param('id', Id) id: string): Promise<void> {
    await this.notifications.markRead(id);
  }

  /** `{ quietHours, types }`: what the "Quiet hours · Settings" row opens. */
  @Get('preferences')
  async preferences() {
    return this.notifications.preferences();
  }

  /** `{ start: "22:00", end: "07:00" }`, in the user's timezone. */
  @Put('preferences/quiet-hours')
  async setQuietHours(@Body(new ZodValidationPipe(quietHoursSchema, 422)) body: QuietHoursDto) {
    return this.notifications.setQuietHours(body);
  }

  /** Turns quiet hours off. */
  @Delete('preferences/quiet-hours')
  async clearQuietHours() {
    return this.notifications.clearQuietHours();
  }
}
