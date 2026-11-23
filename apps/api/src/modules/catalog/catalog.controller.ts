import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { type OccupancyRole, type TenantContext } from '@noah/domain';
import { CurrentTenant, Roles } from '../auth/decorators/roles.decorator.js';
import {
  CatalogService,
  type UpsertAmenityInput,
  type UpsertSettingsInput,
} from './catalog.service.js';

function requireTenant(ctx: TenantContext | undefined): TenantContext {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_HEADER_REQUIRED',
      message: 'Debes indicar el edificio activo en la cabecera x-tenant-id.',
    });
  }
  return ctx;
}

@Controller('catalog')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('settings')
  getSettings(@CurrentTenant() ctx?: TenantContext) {
    return this.catalogService.getSettings(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Put('settings')
  upsertSettings(@CurrentTenant() ctx: TenantContext | undefined, @Body() body: UpsertSettingsInput) {
    return this.catalogService.upsertSettings(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('unit-types')
  listUnitTypes(@CurrentTenant() ctx?: TenantContext) {
    return this.catalogService.listUnitTypes(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('unit-types')
  upsertUnitType(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: { code: string; name: string; includedGuests: number },
  ) {
    return this.catalogService.upsertUnitType(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('amenities')
  listAmenities(@CurrentTenant() ctx?: TenantContext) {
    return this.catalogService.listAmenities(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('amenities')
  upsertAmenity(@CurrentTenant() ctx: TenantContext | undefined, @Body() body: UpsertAmenityInput) {
    return this.catalogService.upsertAmenity(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Put('access-matrix')
  setAccessRule(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: { amenityId: string; occupancyRole: OccupancyRole; allowed: boolean },
  ) {
    return this.catalogService.setAccessRule(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('cleaning-combos')
  listCleaningCombos(@CurrentTenant() ctx?: TenantContext) {
    return this.catalogService.listCleaningCombos(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('cleaning-combos')
  createCleaningCombo(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: { amenityIds: string[]; feeCents: number },
  ) {
    return this.catalogService.createCleaningCombo(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('cleaning-combos/:id')
  deleteCleaningCombo(@CurrentTenant() ctx: TenantContext | undefined, @Param('id') id: string) {
    return this.catalogService.deleteCleaningCombo(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('parking')
  getParking(@CurrentTenant() ctx?: TenantContext) {
    return this.catalogService.getParkingConfig(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Put('parking')
  upsertParking(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: { spots: number; freeMinutes: number; overtimeFeeCentsPerHour: number; rounding?: string },
  ) {
    return this.catalogService.upsertParkingConfig(requireTenant(ctx), body);
  }
}
