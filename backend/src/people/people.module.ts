import { Module } from '@nestjs/common';

import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

/** People (BE-04) and their events. Both tables live in schema/people.ts. */
@Module({
  controllers: [MembersController, EventsController],
  providers: [MembersService, EventsService],
})
export class PeopleModule {}
