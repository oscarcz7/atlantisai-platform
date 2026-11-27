import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { type TenantContext } from '@noah/domain';
import { CurrentTenant, Roles } from '../auth/decorators/roles.decorator.js';
import { parseLimit } from '../../common/dto/query.js';
import { AuditService } from './audit.service.js';

const MAX_FILTER_LENGTH = 200;

/** Rejects repeated (?a=1&a=2 → array) or oversized filters before they reach Prisma. */
function parseFilter(name: string, raw: unknown): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > MAX_FILTER_LENGTH) {
    throw new BadRequestException({
      code: 'INVALID_FILTER',
      message: `El filtro ${name} es inválido.`,
    });
  }
  return raw;
}

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
    @Query('limit') limit?: string,
  ) {
    const tenant = requireTenant(ctx);
    return this.auditService.listLogs(tenant, {
      action: parseFilter('action', action),
      entity: parseFilter('entity', entity),
      actorId: parseFilter('actorId', actorId),
      limit: parseLimit(limit, 100),
    });
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT')
  @Get('reports/summary')
  summary(@CurrentTenant() ctx?: TenantContext) {
    return this.auditService.getOperationalReport(requireTenant(ctx));
  }
}
