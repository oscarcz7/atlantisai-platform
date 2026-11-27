import { isIP } from 'node:net';
import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsIP,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import type {
  GatewayAckInput,
  GatewayEventInput,
  GatewayHeartbeatInput,
  UpsertReaderInput,
} from '../access.service.js';

/** Any UUID version (platform ids are UUIDv7). */
export const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

function inIpv4Cidr(ip: string, base: string, bits: number): boolean {
  const size = 2 ** (32 - bits);
  return Math.floor(ipv4ToInt(ip) / size) === Math.floor(ipv4ToInt(base) / size);
}

/**
 * True for addresses the edge gateway must never be pointed at (SSRF hardening):
 * loopback, link-local (incl. cloud metadata 169.254.169.254), unspecified/"this network".
 * Private LAN ranges (10/8, 172.16/12, 192.168/16, fc00::/7) are allowed on purpose.
 */
export function isForbiddenReaderIp(raw: string): boolean {
  const ip = raw.trim();
  const version = isIP(ip);
  if (version === 4) {
    return (
      inIpv4Cidr(ip, '127.0.0.0', 8) ||
      inIpv4Cidr(ip, '169.254.0.0', 16) ||
      inIpv4Cidr(ip, '0.0.0.0', 8)
    );
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped / compatible forms (::ffff:127.0.0.1)
    const mapped = lower.match(/^(?:0{0,4}:){0,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped?.[1] && isIP(mapped[1]) === 4) return isForbiddenReaderIp(mapped[1]);
    const expanded = expandIpv6(lower);
    if (!expanded) return true;
    if (/^0{28}0{3}[01]$/.test(expanded)) return true; // :: and ::1
    if (/^fe[89ab]/.test(expanded)) return true; // fe80::/10 link-local
    if (expanded === 'fd00' + '0ec2' + '0'.repeat(20) + '0254') return true; // AWS IMDS IPv6
    if (/^0{20}ffff/.test(expanded)) {
      // hex-form IPv4-mapped (::ffff:7f00:1)
      const hi = parseInt(expanded.slice(24, 28), 16);
      const lo = parseInt(expanded.slice(28, 32), 16);
      return isForbiddenReaderIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return false;
  }
  return true;
}

function expandIpv6(ip: string): string | null {
  const [head, tail, extra] = ip.split('::');
  if (extra !== undefined) return null;
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : null;
  const missing = 8 - h.length - (t?.length ?? 0);
  if (t === null && missing !== 0) return null;
  const groups = [...h, ...Array(t === null ? 0 : missing).fill('0'), ...(t ?? [])];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, '0')).join('');
}

function IsAllowedReaderIp(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAllowedReaderIp',
      target: object.constructor,
      propertyName,
      options: {
        message: 'La IP del lector no puede ser loopback, link-local ni de metadatos.',
        ...options,
      },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && !isForbiddenReaderIp(value),
      },
    });
  };
}

export class UpsertReaderDto implements UpsertReaderInput {
  @IsOptional()
  @Matches(UUID_ANY_RE)
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  serial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  @IsOptional()
  @IsIn(['http', 'https'])
  protocol?: 'http' | 'https';

  @IsIP()
  @IsAllowedReaderIp()
  ip!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  doorNo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  firmware?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @Matches(UUID_ANY_RE, { each: true })
  amenityIds!: string[];
}

export class OpenDoorDto {
  // Emptiness (incl. whitespace-only) is rejected by the service with OPEN_DOOR_REASON_REQUIRED (422).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class GatewayAckDto implements GatewayAckInput {
  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  error?: string;
}

export class GatewayHeartbeatReaderDto {
  @IsOptional()
  @Matches(UUID_ANY_RE)
  readerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsBoolean()
  online!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  firmware?: string;
}

export class GatewayHeartbeatDto implements GatewayHeartbeatInput {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GatewayHeartbeatReaderDto)
  readers!: GatewayHeartbeatReaderDto[];
}

export class GatewayEventDto implements GatewayEventInput {
  @IsOptional()
  @Matches(UUID_ANY_RE)
  readerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  readerCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  employeeNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  credentialCode?: string;

  @IsIn(['GRANTED', 'DENIED'])
  result!: 'GRANTED' | 'DENIED';

  @IsISO8601()
  occurredAt!: string;

  @Allow()
  @IsOptional()
  rawPayload?: unknown;
}

export class GatewayEventsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GatewayEventDto)
  events!: GatewayEventDto[];
}
