import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Public } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AdminGuard } from './admin.middleware.js';
import {
  listSessionsSchema,
  searchUsersSchema,
  type ListSessionsDto,
  type SearchUsersDto,
} from './users.dto.js';
import { AdminUsersService } from './users.service.js';

const Id = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/**
 * The console's Users pages (BE-08 for ADM-02).
 *
 * `@Public()` exempts it from the USER guard — a customer session must never
 * reach an admin route — while `AdminGuard` applies the console's own rule,
 * so a mobile token gets 401 here. Every call is audit-logged.
 */
@Controller('admin/v1/users')
@UseGuards(AdminGuard)
@Public()
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /** `?q=` matches email, phone or username. Newest accounts first. */
  @Get()
  async search(@Query(new ZodValidationPipe(searchUsersSchema)) query: SearchUsersDto) {
    return this.users.search(query);
  }

  @Get(':id/sessions')
  async sessions(
    @Param('id', Id) id: string,
    @Query(new ZodValidationPipe(listSessionsSchema)) query: ListSessionsDto,
  ) {
    return this.users.sessions(id, query);
  }

  /** Signs the user out everywhere. Their next request with any token is 401. */
  @Post(':id/sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  async revokeAll(@Param('id', Id) id: string) {
    return this.users.revokeAll(id);
  }
}
