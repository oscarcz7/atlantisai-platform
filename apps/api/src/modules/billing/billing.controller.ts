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
import { parseLimit } from '../../common/dto/query.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { BillingService } from './billing.service.js';
import {
  GenerateMonthlyFeesDto,
  RecordDepositMovementDto,
  RejectPaymentProofDto,
  SubmitPaymentProofDto,
  parsePaymentProofStatus,
} from './dto/billing.dto.js';

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
  getStatement(@CurrentTenant() ctx: TenantContext | undefined, @Param('unitId', ParseIdPipe) unitId: string) {
    return this.billingService.getUnitStatement(requireTenant(ctx), unitId);
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT')
  @Post('monthly-fees/generate')
  generateMonthlyFees(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: GenerateMonthlyFeesDto,
  ) {
    return this.billingService.generateMonthlyFees(requireTenant(ctx), {
      billingMonth: body?.billingMonth,
      dueDate: body?.dueDate,
    });
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT')
  @Get('monthly-balance')
  getMonthlyBalance(@CurrentTenant() ctx: TenantContext | undefined, @Query('months') months?: string) {
    return this.billingService.getMonthlyBalance(requireTenant(ctx), parseLimit(months, 6, 24));
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('deposits/movements')
  recordDepositMovement(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: RecordDepositMovementDto,
  ) {
    return this.billingService.recordDepositMovement(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ACCOUNTANT')
  @Get('payment-proofs')
  listPaymentProofs(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Query('status') status?: string,
  ) {
    return this.billingService.listPaymentProofs(requireTenant(ctx), parsePaymentProofStatus(status));
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT')
  @Post('payment-proofs')
  submitPaymentProof(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Body() body: SubmitPaymentProofDto,
  ) {
    return this.billingService.submitPaymentProof(requireTenant(ctx), body);
  }

  @Roles('SUPERADMIN', 'ACCOUNTANT')
  @Post('payment-proofs/:id/approve')
  @HttpCode(200)
  approvePaymentProof(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id', ParseIdPipe) id: string,
  ) {
    return this.billingService.approvePaymentProof(requireTenant(ctx), id);
  }

  @Roles('SUPERADMIN', 'ACCOUNTANT')
  @Post('payment-proofs/:id/reject')
  @HttpCode(200)
  rejectPaymentProof(
    @CurrentTenant() ctx: TenantContext | undefined,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: RejectPaymentProofDto,
  ) {
    return this.billingService.rejectPaymentProof(requireTenant(ctx), id, body.reason);
  }
}
