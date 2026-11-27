import { Body, Controller, Delete, ForbiddenException, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  type AuthenticatedStaffUser,
  CurrentUser,
  Roles,
} from '../auth/decorators/roles.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { TenantsService } from './tenants.service.js';
import {
  CloneTenantDto,
  CreateTenantDto,
  ImportBuildingConfigDto,
  UpdateTenantDto,
} from './dto/tenants.dto.js';

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
    @Body() body: CreateTenantDto,
  ) {
    return this.tenantsService.create(body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedStaffUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: UpdateTenantDto,
  ) {
    if (user.role !== 'SUPERADMIN' && !user.tenantIds.includes(id)) {
      throw new ForbiddenException({
        code: 'TENANT_ACCESS_DENIED',
        message: 'No tienes permiso para editar este edificio.',
      });
    }
    return this.tenantsService.update(
      id,
      {
        ...body,
        adminUserIds: user.role === 'SUPERADMIN' ? body.adminUserIds : undefined,
      },
      user.id,
    );
  }

  @Roles('SUPERADMIN')
  @Post('import-config')
  importConfig(
    @CurrentUser() user: AuthenticatedStaffUser,
    @Body() body: ImportBuildingConfigDto,
  ) {
    return this.tenantsService.importConfig(body, user.id);
  }

  @Roles('SUPERADMIN')
  @Post(':id/clone')
  clone(
    @CurrentUser() user: AuthenticatedStaffUser,
    @Param('id', ParseIdPipe) sourceId: string,
    @Body() body: CloneTenantDto,
  ) {
    return this.tenantsService.cloneTenant(sourceId, body, user.id);
  }

  @Roles('SUPERADMIN')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedStaffUser, @Param('id', ParseIdPipe) id: string) {
    return this.tenantsService.deleteTenant(id, user.id);
  }
}
