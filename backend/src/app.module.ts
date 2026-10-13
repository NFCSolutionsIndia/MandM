import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.schema';

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

      // Later variables win, so a real `.env` overrides the committed example.
      // Listing the example second means a fresh checkout boots with sensible
      // defaults instead of failing before the developer has written a .env.
      envFilePath: ['.env', '.env.example'],

      // `process.env` stays the source of truth for values already exported by
      // the shell or the container runtime; the files only fill the gaps.
      ignoreEnvFile: false,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
