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
import { type TenantContext } from '@noah/domain';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { CurrentTenant, Roles } from '../auth/decorators/roles.decorator.js';
import { CadastreService } from './cadastre.service.js';
import {
  CreateOccupancyDto,
  CreatePersonDto,
  CreateUnitDto,
  ImportRowsDto,
  UpdateUnitDto,
} from './dto/cadastre.dto.js';

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
  getUnit(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
    return this.cadastreService.getUnitDetail(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('units')
  createUnit(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: CreateUnitDto,
  ) {
    return this.cadastreService.createUnit(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Patch('units/:id')
  updateUnit(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: UpdateUnitDto,
  ) {
    return this.cadastreService.updateUnit(requireTenant(ctx), id, body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('units/:id')
  deactivateUnit(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
    return this.cadastreService.deleteUnit(requireTenant(ctx), id);
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
    @Body() body: CreatePersonDto,
  ) {
    return this.cadastreService.createPerson(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('persons/:id')
  deletePerson(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
    return this.cadastreService.deletePerson(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('occupancies')
  createOccupancy(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: CreateOccupancyDto,
  ) {
    return this.cadastreService.createOccupancy(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('occupancies/:id')
  deleteOccupancy(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
    return this.cadastreService.deleteOccupancy(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('import/preview')
  previewImport(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: ImportRowsDto,
  ) {
    return this.cadastreService.previewImport(requireTenant(ctx), body.rows);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('import/confirm')
  confirmImport(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: ImportRowsDto,
  ) {
    return this.cadastreService.confirmImport(requireTenant(ctx), body.rows);
  }
}
