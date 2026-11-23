import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { type TenantContext } from '@noah/domain';
import { CurrentTenant, Roles } from '../auth/decorators/roles.decorator.js';
import { AuditService } from './audit.service.js';

function requireTenant(ctx: TenantContext | undefined): TenantContext {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_HEADER_REQUIRED',
      message: 'Debes indicar el edificio activo en la cabecera x-tenant-id.',
    });
  }
  return ctx;
}

@Controller('audit')
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT')
  @Get('logs')
  listLogs(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.auditService.listLogs(requireTenant(ctx), { action, entity, actorId });
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT')
  @Get('reports/summary')
  summary(@CurrentTenant() ctx?: TenantContext) {
    return this.auditService.getOperationalReport(requireTenant(ctx));
  }
}
