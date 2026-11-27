import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { type StaffRole } from '@noah/domain';

const STAFF_ROLES: StaffRole[] = ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD'];

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  totpCode?: string;

  @IsOptional()
  @IsString()
  recoveryCode?: string;
}

export class ConfirmTotpDto {
  @IsString()
  code!: string;
}

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}

export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}

export class InviteStaffUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsIn(STAFF_ROLES)
  role!: StaffRole;

  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tenantIds!: string[];
}

export class UpdateStaffUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tenantIds?: string[];
}
