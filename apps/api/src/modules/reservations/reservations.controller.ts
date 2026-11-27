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
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import {
  CancelReservationDto,
  CreateAdminBlockDto,
  CreateReservationDto,
  UpdateReservationDto,
  parseIdQuery,
  parseIsoQuery,
} from './dto/reservations.dto.js';
import { ReservationsService } from './reservations.service.js';

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
    return this.reservationsService.listCalendar(requireTenant(ctx), {
      from: parseIsoQuery(from, 'from'),
      to: parseIsoQuery(to, 'to'),
      amenityId: parseIdQuery(amenityId),
    });
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('simulate')
  @HttpCode(200)
  simulate(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: CreateReservationDto,
  ) {
    return this.reservationsService.simulate(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post()
  create(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: CreateReservationDto,
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
    @Body() body: CreateAdminBlockDto,
  ) {
    return this.reservationsService.createAdminBlock(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: UpdateReservationDto,
  ) {
    return this.reservationsService.update(requireTenant(ctx), id, body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: CancelReservationDto,
  ) {
    return this.reservationsService.cancel(requireTenant(ctx), id, body.reason);
  }
}
