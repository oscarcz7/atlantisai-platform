import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { FieldEncryptionService } from './crypto/field-encryption.service.js';
import { TotpService } from './crypto/totp.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { ConsoleMailer, MAILER_TOKEN } from './mailer/mailer.interface.js';
import { StaffUsersController } from './staff-users.controller.js';
import { StaffUsersService } from './staff-users.service.js';

@Module({
  controllers: [AuthController, StaffUsersController],
  providers: [
    FieldEncryptionService,
    TotpService,
    ConsoleMailer,
    { provide: MAILER_TOKEN, useExisting: ConsoleMailer },
    AuthService,
    StaffUsersService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, FieldEncryptionService, TotpService, MAILER_TOKEN],
})
export class AuthModule {}
