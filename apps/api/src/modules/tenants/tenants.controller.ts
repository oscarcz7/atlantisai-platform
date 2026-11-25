import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  type AuthenticatedStaffUser,
  CurrentUser,
  Roles,
} from '../auth/decorators/roles.decorator.js';
import { type BuildingConfigImportJson, TenantsService } from './tenants.service.js';

@Controller('tenants')
export class TenantsController {
  constructor(@Inject(TenantsService) private readonly tenantsService: TenantsService) {}

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get()
  list(@CurrentUser() user: AuthenticatedStaffUser) {
    return this.tenantsService.listForUser(user);
  }

  @Roles('SUPERADMIN')
  @Post()
  create(
    @Body()
    body: {
      code: string;
      name: string;
      ruc?: string;
      logoUrl?: string;
      timezone?: string;
      contacts?: Record<string, unknown>;
      officeHours?: Record<string, unknown>;
      bankAccounts?: Array<Record<string, unknown>>;
    },
  ) {
    return this.tenantsService.create(body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedStaffUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      ruc?: string;
      logoUrl?: string;
      timezone?: string;
      contacts?: Record<string, unknown>;
      officeHours?: Record<string, unknown>;
      bankAccounts?: Array<Record<string, unknown>>;
    },
  ) {
    if (user.role !== 'SUPERADMIN' && !user.tenantIds.includes(id)) {
      throw new ForbiddenException({
        code: 'TENANT_ACCESS_DENIED',
        message: 'No tienes permiso para editar este edificio.',
      });
    }
    return this.tenantsService.update(id, body);
  }

  @Roles('SUPERADMIN')
  @Post('import-config')
  importConfig(
    @CurrentUser() user: AuthenticatedStaffUser,
    @Body() body: BuildingConfigImportJson,
  ) {
    return this.tenantsService.importConfig(body, user.id);
  }

  @Roles('SUPERADMIN')
  @Post(':id/clone')
  clone(
    @CurrentUser() user: AuthenticatedStaffUser,
    @Param('id') sourceId: string,
    @Body() body: { code: string; name: string },
  ) {
    return this.tenantsService.cloneTenant(sourceId, body, user.id);
  }
}
