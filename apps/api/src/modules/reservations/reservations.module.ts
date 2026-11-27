import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationExpiryScheduler } from './reservation-expiry.scheduler.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [AccessModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationExpiryScheduler],
  exports: [ReservationsService],
})
export class ReservationsModule {}
