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
    @Query('status') status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
  ) {
    return this.incidentsService.list(requireTenant(ctx), status);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post()
  create(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body()
    body: {
      category: string;
      location: string;
      description: string;
      urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
      photos?: string[];
    },
  ) {
    return this.incidentsService.create(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Patch(':id/status')
  updateStatus(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id') id: string,
    @Body() body: { status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; assignedTo?: string },
  ) {
    return this.incidentsService.updateStatus(requireTenant(ctx), id, body.status, body.assignedTo);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post(':id/subscribe')
  subscribe(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id') id: string,
    @Body() body: { personId: string },
  ) {
    return this.incidentsService.subscribe(requireTenant(ctx), id, body.personId);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete(':id')
  remove(@CurrentTenant() ctx: TenantContext | undefined, @Param('id') id: string) {
    return this.incidentsService.remove(requireTenant(ctx), id);
  }
}
