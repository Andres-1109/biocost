import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InsumosModule } from '../insumos/insumos.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [InsumosModule, AuditModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
