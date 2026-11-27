import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { type TenantContext } from '@noah/domain';
import { CurrentTenant, Public, Roles } from '../auth/decorators/roles.decorator.js';
import {
  AccessService,
  type GatewayAckInput,
  type GatewayEventInput,
  type GatewayHeartbeatInput,
  type UpsertReaderInput,
} from './access.service.js';

function requireTenant(ctx: TenantContext | undefined): TenantContext {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_HEADER_REQUIRED',
      message: 'Debes indicar el edificio activo en la cabecera x-tenant-id.',
    });
  }
  return ctx;
}

function assertGatewayToken(headerToken?: string): void {
  const expected = process.env['GATEWAY_API_TOKEN'] || 'dev-gateway-token';
  if (!headerToken || headerToken !== expected) {
    throw new UnauthorizedException({
      code: 'INVALID_GATEWAY_TOKEN',
      message: 'Token de Edge Gateway inválido.',
    });
  }
}

@Controller('access')
export class AccessController {
  constructor(@Inject(AccessService) private readonly accessService: AccessService) {}

  // --- Staff Dashboard Endpoints ---

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get('reservations/:id/ticket')
  getTicket(@CurrentTenant() ctx: TenantContext | undefined, @Param('id') id: string) {
    return this.accessService.getReservationTicket(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('reservations/:id/resync')
  @HttpCode(200)
  resyncReservation(@CurrentTenant() ctx: TenantContext | undefined, @Param('id') id: string) {
    return this.accessService.resyncReservationCredential(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get('readers')
  listReaders(@CurrentTenant() ctx: TenantContext | undefined) {
    return this.accessService.listReaders(requireTenant(ctx));
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('readers')
  upsertReader(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: UpsertReaderInput,
  ) {
    return this.accessService.upsertReader(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('readers/:id')
  deleteReader(@CurrentTenant() ctx: TenantContext | undefined, @Param('id') id: string) {
    return this.accessService.deleteReader(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post('readers/:id/open')
  @HttpCode(200)
  openDoor(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.accessService.triggerOpenDoor(requireTenant(ctx), id, body?.reason ?? '');
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get('commands')
  listCommands(@CurrentTenant() ctx: TenantContext | undefined, @Query('limit') limit?: string) {
    return this.accessService.listGatewayCommands(requireTenant(ctx), limit ? Number(limit) : 50);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get('events')
  listEvents(@CurrentTenant() ctx: TenantContext | undefined, @Query('limit') limit?: string) {
    return this.accessService.listAccessEvents(requireTenant(ctx), limit ? Number(limit) : 50);
  }

  // --- Public Digital Pass Endpoint (HMAC signed, no login) ---

  @Public()
  @Get('passes/:token')
  getPublicPass(@Param('token') token: string) {
    return this.accessService.getPublicPass(token);
  }

  // --- Edge Gateway Machine-to-Machine Endpoints ---

  @Public()
  @Get('gateway/commands')
  pullGatewayCommands(
    @Headers('x-gateway-token') gatewayToken?: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant') tenantQuery?: string,
    @Query('limit') limit?: string,
  ) {
    assertGatewayToken(gatewayToken);
    const tenant = tenantHeader || tenantQuery;
    if (!tenant) {
      throw new BadRequestException({ code: 'TENANT_REQUIRED', message: 'Falta x-tenant-id o ?tenant=' });
    }
    return this.accessService.pullGatewayCommands(tenant, limit ? Number(limit) : 20);
  }

  @Public()
  @Post('gateway/commands/:id/ack')
  @HttpCode(200)
  ackGatewayCommand(
    @Headers('x-gateway-token') gatewayToken: string | undefined,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: GatewayAckInput,
    @Query('tenant') tenantQuery?: string,
  ) {
    assertGatewayToken(gatewayToken);
    const tenant = tenantHeader || tenantQuery;
    if (!tenant) {
      throw new BadRequestException({ code: 'TENANT_REQUIRED', message: 'Falta x-tenant-id o ?tenant=' });
    }
    return this.accessService.ackGatewayCommand(tenant, id, body);
  }

  @Public()
  @Post('gateway/heartbeat')
  @HttpCode(200)
  heartbeat(
    @Headers('x-gateway-token') gatewayToken: string | undefined,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: GatewayHeartbeatInput,
    @Query('tenant') tenantQuery?: string,
  ) {
    assertGatewayToken(gatewayToken);
    const tenant = tenantHeader || tenantQuery;
    if (!tenant) {
      throw new BadRequestException({ code: 'TENANT_REQUIRED', message: 'Falta x-tenant-id o ?tenant=' });
    }
    return this.accessService.recordGatewayHeartbeat(tenant, body);
  }

  @Public()
  @Post('gateway/events')
  @HttpCode(200)
  ingestEvents(
    @Headers('x-gateway-token') gatewayToken: string | undefined,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: { events: GatewayEventInput[] },
    @Query('tenant') tenantQuery?: string,
  ) {
    assertGatewayToken(gatewayToken);
    const tenant = tenantHeader || tenantQuery;
    if (!tenant) {
      throw new BadRequestException({ code: 'TENANT_REQUIRED', message: 'Falta x-tenant-id o ?tenant=' });
    }
    return this.accessService.ingestAccessEvents(tenant, body.events ?? []);
  }
}
