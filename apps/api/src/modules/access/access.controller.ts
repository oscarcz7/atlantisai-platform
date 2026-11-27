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
} from '@nestjs/common';
import { type TenantContext } from '@noah/domain';
import { CurrentTenant, Public, Roles } from '../auth/decorators/roles.decorator.js';
import { parseLimit } from '../../common/dto/query.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { AccessService } from './access.service.js';
import {
  GatewayAckDto,
  GatewayEventsDto,
  GatewayHeartbeatDto,
  OpenDoorDto,
  UpsertReaderDto,
} from './dto/access.dto.js';

const MAX_PASS_TOKEN_LENGTH = 2048;

function requireTenant(ctx: TenantContext | undefined): TenantContext {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_HEADER_REQUIRED',
      message: 'Debes indicar el edificio activo en la cabecera x-tenant-id.',
    });
  }
  return ctx;
}

@Controller('access')
export class AccessController {
  constructor(@Inject(AccessService) private readonly accessService: AccessService) {}

  // --- Staff Dashboard Endpoints ---

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get('reservations/:id/ticket')
  getTicket(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
    return this.accessService.getReservationTicket(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('reservations/:id/resync')
  @HttpCode(200)
  resyncReservation(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
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
    @Body() body: UpsertReaderDto,
  ) {
    return this.accessService.upsertReader(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete('readers/:id')
  deleteReader(@CurrentTenant() ctx: TenantContext | undefined, @Param('id', ParseIdPipe) id: string) {
    return this.accessService.deleteReader(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Post('readers/:id/open')
  @HttpCode(200)
  openDoor(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: OpenDoorDto,
  ) {
    return this.accessService.triggerOpenDoor(requireTenant(ctx), id, body?.reason ?? '');
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get('commands')
  listCommands(@CurrentTenant() ctx: TenantContext | undefined, @Query('limit') limit?: string) {
    return this.accessService.listGatewayCommands(requireTenant(ctx), parseLimit(limit, 50));
  }

  @Roles('SUPERADMIN', 'ADMIN', 'GUARD')
  @Get('events')
  listEvents(@CurrentTenant() ctx: TenantContext | undefined, @Query('limit') limit?: string) {
    return this.accessService.listAccessEvents(requireTenant(ctx), parseLimit(limit, 50));
  }

  // --- Public Digital Pass Endpoint (HMAC signed, no login) ---

  @Public()
  @Get('passes/:token')
  getPublicPass(@Param('token') token: string) {
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_PASS_TOKEN_LENGTH) {
      throw new BadRequestException({ code: 'INVALID_PASS_TOKEN', message: 'Pase digital inválido.' });
    }
    return this.accessService.getPublicPass(token);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('gateway/token/rotate')
  @HttpCode(200)
  rotateGatewayToken(@CurrentTenant() ctx: TenantContext | undefined) {
    return this.accessService.rotateGatewayToken(requireTenant(ctx));
  }

  // --- Edge Gateway Machine-to-Machine Endpoints ---
  // Tenant is derived from the per-tenant x-gateway-token. x-tenant-id / ?tenant= are only
  // honoured for the legacy shared dev token (never in production).

  @Public()
  @Get('gateway/commands')
  async pullGatewayCommands(
    @Headers('x-gateway-token') gatewayToken?: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant') tenantQuery?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = await this.accessService.resolveGatewayTenant(gatewayToken, tenantHeader || tenantQuery);
    return this.accessService.pullGatewayCommands(tenantId, parseLimit(limit, 20, 100));
  }

  @Public()
  @Post('gateway/commands/:id/ack')
  @HttpCode(200)
  async ackGatewayCommand(
    @Headers('x-gateway-token') gatewayToken: string | undefined,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: GatewayAckDto,
    @Query('tenant') tenantQuery?: string,
  ) {
    const tenantId = await this.accessService.resolveGatewayTenant(gatewayToken, tenantHeader || tenantQuery);
    return this.accessService.ackGatewayCommand(tenantId, id, body);
  }

  @Public()
  @Post('gateway/heartbeat')
  @HttpCode(200)
  async heartbeat(
    @Headers('x-gateway-token') gatewayToken: string | undefined,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: GatewayHeartbeatDto,
    @Query('tenant') tenantQuery?: string,
  ) {
    const tenantId = await this.accessService.resolveGatewayTenant(gatewayToken, tenantHeader || tenantQuery);
    return this.accessService.recordGatewayHeartbeat(tenantId, body);
  }

  @Public()
  @Post('gateway/events')
  @HttpCode(200)
  async ingestEvents(
    @Headers('x-gateway-token') gatewayToken: string | undefined,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: GatewayEventsDto,
    @Query('tenant') tenantQuery?: string,
  ) {
    const tenantId = await this.accessService.resolveGatewayTenant(gatewayToken, tenantHeader || tenantQuery);
    return this.accessService.ingestAccessEvents(tenantId, body?.events ?? []);
  }
}
