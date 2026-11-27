import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Any UUID version (platform ids are UUIDv7). */
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

export class CreateIncidentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsIn(TICKET_URGENCIES)
  urgency?: TicketUrgency;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  photos?: string[];
}

export class UpdateIncidentStatusDto {
  @IsIn(TICKET_STATUSES)
  status!: TicketStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignedTo?: string;
}

export class SubscribeIncidentDto {
  @Matches(UUID_ANY_RE)
  personId!: string;
}
