import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.schema.js';
import { DbModule } from './db/db.module.js';
import { HealthModule } from './health/health.module.js';

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

    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
