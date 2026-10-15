import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AdminModule } from './admin/admin.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.schema.js';
import { DbModule } from './db/db.module.js';
import { HealthModule } from './health/health.module.js';
import { MailModule } from './mail/mail.module.js';
import { VaultsModule } from './vaults/vaults.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      // Available everywhere without each module importing ConfigModule again.
      // Configuration is genuinely cross-cutting, which is the one case where
      // a global module is the right call rather than a shortcut.
      isGlobal: true,

      // Runs validateEnv() before the application starts. A failure here aborts
      // the bootstrap, so a misconfigured deploy never begins serving traffic.
      validate: validateEnv,

      // Only `.env`. No .env file of any kind is committed — not even an
      // example — so there is nothing to fall back to, and that is deliberate:
      // a fresh checkout should fail loudly with the list of what is missing
      // rather than boot on someone else's defaults.
      envFilePath: '.env',

      // `process.env` stays the source of truth for values already exported by
      // the shell or the container runtime; the files only fill the gaps.
      ignoreEnvFile: false,
    }),

    // The connection pool, global so feature modules do not each import it.
    DbModule,

    MailModule,
    AuthModule,
    AdminModule,
    VaultsModule,
    HealthModule,
  ],
  providers: [
    {
      /**
       * Authentication required by default.
       *
       * Registered globally so that a new route is protected the moment it is
       * written, and opting out is an explicit `@Public()` that a reviewer can
       * see in the diff. The alternative — remembering to add a guard — fails
       * open the first time somebody forgets.
       *
       * It is still only a 401. The real boundary is row-level security, which
       * would deny an unauthenticated request even if this guard vanished.
       */
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
