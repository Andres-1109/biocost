import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InsumosModule } from '../insumos/insumos.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [InsumosModule, AuditModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
