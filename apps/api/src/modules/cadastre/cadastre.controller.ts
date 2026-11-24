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
} from '@nestjs/common';
import { type OccupancyRole, type TenantContext } from '@noah/domain';
import { CurrentTenant, Roles } from '../auth/decorators/roles.decorator.js';
import { CadastreService, type ImportRowInput } from './cadastre.service.js';

function requireTenant(ctx: TenantContext | undefined): TenantContext {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_HEADER_REQUIRED',
      message: 'Debes indicar el edificio activo en la cabecera x-tenant-id.',
    });
  }
  return ctx;
}

@Controller('cadastre')
export class CadastreController {
  constructor(@Inject(CadastreService) private readonly cadastreService: CadastreService) {}

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('units')
  listUnits(@CurrentTenant() ctx?: TenantContext) {
    return this.cadastreService.listUnits(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('units/:id')
  getUnit(@CurrentTenant() ctx: TenantContext | undefined, @Param('id') id: string) {
    return this.cadastreService.getUnitDetail(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('units')
  createUnit(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body()
    body: {
      number: string;
      floor: number;
      unitTypeId: string;
      areaSqm?: number | null;
      bedrooms?: number;
      monthlyFeeCents?: number;
    },
  ) {
    return this.cadastreService.createUnit(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Patch('units/:id')
  updateUnit(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id') id: string,
    @Body()
    body: {
      number?: string;
      floor?: number;
      unitTypeId?: string;
      areaSqm?: number | null;
      bedrooms?: number;
      monthlyFeeCents?: number;
      isActive?: boolean;
    },
  ) {
    return this.cadastreService.updateUnit(requireTenant(ctx), id, body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('units/:id')
  deactivateUnit(@CurrentTenant() ctx: TenantContext | undefined, @Param('id') id: string) {
    return this.cadastreService.deactivateUnit(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('persons')
  listPersons(@CurrentTenant() ctx?: TenantContext) {
    return this.cadastreService.listPersons(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('persons')
  createPerson(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body()
    body: {
      fullName: string;
      nationalId: string;
      waPhone: string;
      email?: string;
      consentAt?: string;
    },
  ) {
    return this.cadastreService.createPerson(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('occupancies')
  createOccupancy(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body()
    body: {
      personId: string;
      unitId: string;
      role: OccupancyRole;
      validFrom: string;
      validTo?: string | null;
    },
  ) {
    return this.cadastreService.createOccupancy(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('import/preview')
  previewImport(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: { rows: ImportRowInput[] },
  ) {
    return this.cadastreService.previewImport(requireTenant(ctx), body.rows);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('import/confirm')
  confirmImport(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: { rows: ImportRowInput[] },
  ) {
    return this.cadastreService.confirmImport(requireTenant(ctx), body.rows);
  }
}
