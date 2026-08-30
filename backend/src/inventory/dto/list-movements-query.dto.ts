import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { InventoryMovementTipo } from '@prisma/client';

export class ListMovementsQueryDto {
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  insumoId?: string;

  // El campo tipo (ENTRADA_COMPRA/SALIDA_CONSUMO/AJUSTE_MANUAL) ya
  // distingue visualmente los ajustes manuales del resto (HU-21).
  @IsOptional()
  @IsEnum(InventoryMovementTipo)
  tipo?: InventoryMovementTipo;
}
