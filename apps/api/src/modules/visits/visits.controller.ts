import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { type TenantContext } from '@noah/domain';
import { CurrentTenant, Roles } from '../auth/decorators/roles.decorator.js';
import { VisitsService } from './visits.service.js';

function requireTenant(ctx: TenantContext | undefined): TenantContext {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_HEADER_REQUIRED',
      message: 'Debes indicar el edificio activo en la cabecera x-tenant-id.',
    });
  }
  return ctx;
}

@Controller('visits')
export class VisitsController {
  constructor(@Inject(VisitsService) private readonly visitsService: VisitsService) {}

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get()
  list(@CurrentTenant() ctx: TenantContext | undefined, @Query('search') search?: string) {
    return this.visitsService.list(requireTenant(ctx), search);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get('parking-status')
  parkingStatus(@CurrentTenant() ctx?: TenantContext) {
    return this.visitsService.getParkingStatus(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post()
  register(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body()
    body: {
      hostUnitId: string;
      visitorName: string;
      nationalId: string;
      plate?: string;
      needsParking: boolean;
      expectedAt: string;
    },
  ) {
    return this.visitsService.registerVisit(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post(':id/check-in')
  @HttpCode(200)
  checkIn(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id') id: string,
    @Body() body: { parkingSpot?: number },
  ) {
    return this.visitsService.checkIn(requireTenant(ctx), id, body.parkingSpot);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post(':id/check-out')
  @HttpCode(200)
  checkOut(@CurrentTenant() ctx: TenantContext | undefined, @Param('id') id: string) {
    return this.visitsService.checkOut(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post('undeclared-guests')
  registerUndeclaredGuests(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: { unitId: string; reservationId: string; count: number },
  ) {
    return this.visitsService.registerUndeclaredGuests(requireTenant(ctx), body);
  }
}
