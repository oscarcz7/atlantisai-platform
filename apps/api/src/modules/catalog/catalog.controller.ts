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
import { type TenantContext } from '@noah/domain';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { CurrentTenant, Roles } from '../auth/decorators/roles.decorator.js';
import { CatalogService } from './catalog.service.js';
import {
  CreateCleaningComboDto,
  SetAccessRuleDto,
  UpsertAmenityDto,
  UpsertParkingDto,
  UpsertSettingsDto,
  UpsertUnitTypeDto,
} from './dto/catalog.dto.js';

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
  upsertSettings(@CurrentTenant() ctx: TenantContext | undefined, @Body() body: UpsertSettingsDto) {
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
    @Body() body: UpsertUnitTypeDto,
  ) {
    return this.catalogService.upsertUnitType(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('unit-types/:id')
  deleteUnitType(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
    return this.catalogService.deleteUnitType(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('amenities')
  listAmenities(@CurrentTenant() ctx?: TenantContext) {
    return this.catalogService.listAmenities(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('amenities')
  upsertAmenity(@CurrentTenant() ctx: TenantContext | undefined, @Body() body: UpsertAmenityDto) {
    return this.catalogService.upsertAmenity(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('amenities/:id')
  deleteAmenity(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
    return this.catalogService.deleteAmenity(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Put('access-matrix')
  setAccessRule(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: SetAccessRuleDto,
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
    @Body() body: CreateCleaningComboDto,
  ) {
    return this.catalogService.createCleaningCombo(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('cleaning-combos/:id')
  deleteCleaningCombo(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
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
    @Body() body: UpsertParkingDto,
  ) {
    return this.catalogService.upsertParkingConfig(requireTenant(ctx), body);
  }
}
