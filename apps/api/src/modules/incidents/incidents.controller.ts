import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { type TenantContext } from '@noah/domain';
import { CurrentTenant, Roles } from '../auth/decorators/roles.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import {
  CreateIncidentDto,
  SubscribeIncidentDto,
  TICKET_STATUSES,
  type TicketStatus,
  UpdateIncidentStatusDto,
} from './dto/incidents.dto.js';
import { IncidentsService } from './incidents.service.js';

function requireTenant(ctx: TenantContext | undefined): TenantContext {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_HEADER_REQUIRED',
      message: 'Debes indicar el edificio activo en la cabecera x-tenant-id.',
    });
  }
  return ctx;
}

@Controller('incidents')
export class IncidentsController {
  constructor(@Inject(IncidentsService) private readonly incidentsService: IncidentsService) {}

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get()
  list(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Query('status') status?: string,
  ) {
    if (status !== undefined && status !== '' && !(TICKET_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Estado de incidencia inválido.' });
    }
    return this.incidentsService.list(requireTenant(ctx), (status || undefined) as TicketStatus | undefined);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post()
  create(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: CreateIncidentDto,
  ) {
    return this.incidentsService.create(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Patch(':id/status')
  updateStatus(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: UpdateIncidentStatusDto,
  ) {
    return this.incidentsService.updateStatus(requireTenant(ctx), id, body.status, body.assignedTo);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post(':id/subscribe')
  subscribe(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: SubscribeIncidentDto,
  ) {
    return this.incidentsService.subscribe(requireTenant(ctx), id, body.personId);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete(':id')
  remove(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
    return this.incidentsService.remove(requireTenant(ctx), id);
  }
}
