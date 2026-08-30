import { IsDateString, IsEnum, IsOptional, IsPositive, IsUUID, IsUrl, MaxLength } from 'class-validator';
import { TransaccionCategoria } from '@prisma/client';

// Campos editables por el Admin (HU-17): corrige errores de digitación,
// no reasigna la transacción a otro ciclo ni cambia si es ingreso/egreso
// (tipo y cycleId quedan fuera a propósito).
export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TransaccionCategoria)
  categoria?: TransaccionCategoria;

  @IsOptional()
  @IsPositive()
  monto?: number;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsPositive()
  cantidad?: number;

  @IsOptional()
  @MaxLength(30)
  unidadMedida?: string;

  @IsOptional()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsUrl()
  facturaUrl?: string;

  @IsOptional()
  @IsUUID()
  insumoId?: string;
}
