import { Global, Module } from '@nestjs/common';

import { MailService } from './mail.service.js';

/** Global: several domains send mail, and none of them should import this. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
