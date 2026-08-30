import {
  IsDateString,
  IsIn,
  IsOptional,
  IsPositive,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { TransaccionCategoria } from '@prisma/client';
import { EGRESO_CATEGORIES } from '../transaction-categories.constants';

export class CreateEgresoDto {
  @IsIn(EGRESO_CATEGORIES)
  categoria!: TransaccionCategoria;

  @IsPositive()
  monto!: number;

  @IsDateString()
  fecha!: string;

  @IsOptional()
  @IsPositive()
  cantidad?: number;

  @IsOptional()
  @MaxLength(30)
  unidadMedida?: string;

  @IsUUID()
  cycleId!: string;

  @IsOptional()
  @MaxLength(500)
  descripcion?: string;

  // Campo listo para HU-16 (subida a Cloudflare R2) — por ahora acepta una
  // URL directa si el cliente ya la tiene; no hay endpoint de subida.
  @IsOptional()
  @IsUrl()
  facturaUrl?: string;

  // Obligatorio solo si categoria es ALIMENTO_CONCENTRADO o INSUMOS_QUIMICOS
  // (validado en el service, no aquí — depende del valor de otro campo).
  @IsOptional()
  @IsUUID()
  insumoId?: string;
}
