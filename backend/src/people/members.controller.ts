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
  createMemberSchema,
  listMembersSchema,
  updateMemberSchema,
  type CreateMemberDto,
  type ListMembersDto,
  type UpdateMemberDto,
} from './members.dto.js';
import { MembersService } from './members.service.js';

/** A malformed id names nobody: 404, the same as somebody else's. */
const Id = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/** People (BE-04). Every route needs a session; the owner is the session's user. */
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /** `GET /members?q=&cursor=&limit=20` → `{ items, nextCursor }`, by name. */
  @Get()
  async list(@Query(new ZodValidationPipe(listMembersSchema)) query: ListMembersDto) {
    return this.members.list(query);
  }

  /** 201 with the person, as `GET /members/:id` returns them. */
  @Post()
  async create(@Body(new ZodValidationPipe(createMemberSchema, 422)) body: CreateMemberDto) {
    return this.members.create(body);
  }

  /** The person, their next birthday and anniversary, linked events, and capsule counts. */
  @Get(':id')
  async get(@Param('id', Id) id: string) {
    return this.members.get(id);
  }

  /** Any subset of fields; `null` clears one. */
  @Patch(':id')
  async update(
    @Param('id', Id) id: string,
    @Body(new ZodValidationPipe(updateMemberSchema, 422)) body: UpdateMemberDto,
  ) {
    return this.members.update(id, body);
  }

  /** 204, or 409 `{ reason: "member_has_capsules", capsuleIds }`. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', Id) id: string) {
    await this.members.remove(id);
  }
}
