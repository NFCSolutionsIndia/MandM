import { Body, Controller, Get, Patch, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod.pipe.js';
import {
  changeUsernameSchema,
  usernameAvailableQuerySchema,
  type ChangeUsernameDto,
  type UsernameAvailableQueryDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

/** The signed-in user's own account (BE-03). Every route needs a session. */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** `GET /users/me` — includes `username`, and when it may next be changed. */
  @Get('me')
  async me() {
    return this.users.me();
  }

  /**
   * `GET /users/username-available?u=aarav.k`
   * → `{ username, available, reason?, message?, suggestions }`
   */
  @Get('username-available')
  async available(
    @Query(new ZodValidationPipe(usernameAvailableQuerySchema))
    query: UsernameAvailableQueryDto,
  ) {
    return this.users.availability(query.u);
  }

  /** `PATCH /users/me/username` → 200 | 409 taken | 422 invalid or reserved | 429 too soon. */
  @Patch('me/username')
  async changeUsername(
    @Body(new ZodValidationPipe(changeUsernameSchema, 422)) body: ChangeUsernameDto,
  ) {
    return this.users.changeUsername(body.username);
  }
}
