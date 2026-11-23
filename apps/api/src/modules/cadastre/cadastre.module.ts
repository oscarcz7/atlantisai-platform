import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CadastreController } from './cadastre.controller.js';
import { CadastreService } from './cadastre.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CadastreController],
  providers: [CadastreService],
  exports: [CadastreService],
})
export class CadastreModule {}
