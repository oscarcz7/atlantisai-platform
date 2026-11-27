import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { type TenantContext } from '@noah/domain';
import { CurrentTenant, Roles } from '../auth/decorators/roles.decorator.js';
import {
  type CreateAdminBlockInput,
  type CreateReservationInput,
  type UpdateReservationInput,
  ReservationsService,
} from './reservations.service.js';

function requireTenant(ctx: TenantContext | undefined): TenantContext {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_HEADER_REQUIRED',
      message: 'Debes indicar el edificio activo en la cabecera x-tenant-id.',
    });
  }
  return ctx;
}

@Controller('reservations')
export class ReservationsController {
  constructor(
    @Inject(ReservationsService) private readonly reservationsService: ReservationsService,
  ) {}

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get()
  list(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('amenityId') amenityId?: string,
  ) {
    return this.reservationsService.listCalendar(requireTenant(ctx), { from, to, amenityId });
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('simulate')
  @HttpCode(200)
  simulate(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: CreateReservationInput,
  ) {
    return this.reservationsService.simulate(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post()
  create(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: CreateReservationInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reservationsService.create(requireTenant(ctx), {
      ...body,
      idempotencyKey: idempotencyKey ?? body.idempotencyKey,
    });
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('admin-blocks')
  createAdminBlock(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: CreateAdminBlockInput,
  ) {
    return this.reservationsService.createAdminBlock(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id') id: string,
    @Body() body: UpdateReservationInput,
  ) {
    return this.reservationsService.update(requireTenant(ctx), id, body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.reservationsService.cancel(requireTenant(ctx), id, body.reason);
  }
}
