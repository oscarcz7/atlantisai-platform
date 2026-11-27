import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  JOB_QUEUE_TOKEN,
  type JobQueue,
  RESERVATIONS_EXPIRE_QUEUE,
} from '../../common/queue/job-queue.interface.js';
import { ReservationsService } from './reservations.service.js';

/** Every 5 minutes, unpaid PENDING_PAYMENT holds past holdExpiresAt are released (spec 006). */
@Injectable()
export class ReservationExpiryScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReservationExpiryScheduler.name);

  constructor(
    @Inject(JOB_QUEUE_TOKEN) private readonly queue: JobQueue,
    @Inject(ReservationsService) private readonly reservations: ReservationsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env['NODE_ENV'] === 'test' || process.env['DISABLE_SCHEDULERS'] === 'true') return;
    try {
      await this.queue.work(RESERVATIONS_EXPIRE_QUEUE, async () => {
        const expired = await this.reservations.expirePendingReservationsAllTenants();
        if (expired > 0) {
          this.logger.log(JSON.stringify({ event: 'reservations.expired', count: expired }));
        }
      });
      await this.queue.schedule(RESERVATIONS_EXPIRE_QUEUE, '*/5 * * * *');
    } catch (err) {
      // Never block API startup because of the scheduler.
      this.logger.error(
        JSON.stringify({ event: 'scheduler.init_failed', message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }
}
