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
import { BillingService } from './billing.service.js';

function requireTenant(ctx: TenantContext | undefined): TenantContext {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_HEADER_REQUIRED',
      message: 'Debes indicar el edificio activo en la cabecera x-tenant-id.',
    });
  }
  return ctx;
}

@Controller('billing')
export class BillingController {
  constructor(@Inject(BillingService) private readonly billingService: BillingService) {}

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT')
  @Get('units/:unitId/statement')
  getStatement(@CurrentTenant() ctx: TenantContext | undefined, @Param('unitId') unitId: string) {
    return this.billingService.getUnitStatement(requireTenant(ctx), unitId);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT')
  @Post('monthly-fees/generate')
  generateMonthlyFees(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: { billingMonth: string; dueDate: string },
  ) {
    return this.billingService.generateMonthlyFees(requireTenant(ctx), body.billingMonth, body.dueDate);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('deposits/movements')
  recordDepositMovement(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body()
    body: {
      unitId: string;
      type: 'DEPOSIT' | 'DEDUCTION' | 'REFUND';
      amountCents: number;
      reason: string;
      evidenceKey?: string;
    },
  ) {
    return this.billingService.recordDepositMovement(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ACCOUNTANT')
  @Get('payment-proofs')
  listPaymentProofs(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) {
    return this.billingService.listPaymentProofs(requireTenant(ctx), status);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT')
  @Post('payment-proofs')
  submitPaymentProof(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body()
    body: {
      unitId: string;
      reservationId?: string;
      fileKey: string;
      bank: string;
      amountCents: number;
      transferDate: string;
      reference: string;
    },
  ) {
    return this.billingService.submitPaymentProof(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ACCOUNTANT')
  @Post('payment-proofs/:id/approve')
  @HttpCode(200)
  approvePaymentProof(@CurrentTenant() ctx: TenantContext | undefined, @Param('id') id: string) {
    return this.billingService.approvePaymentProof(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ACCOUNTANT')
  @Post('payment-proofs/:id/reject')
  @HttpCode(200)
  rejectPaymentProof(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.billingService.rejectPaymentProof(requireTenant(ctx), id, body.reason);
  }
}
