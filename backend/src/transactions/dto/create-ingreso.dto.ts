import { IsDateString, IsIn, IsOptional, IsPositive, IsUUID, IsUrl, MaxLength } from 'class-validator';
import { TransaccionCategoria } from '@prisma/client';
import { INGRESO_CATEGORIES } from '../transaction-categories.constants';

export class CreateIngresoDto {
  @IsIn(INGRESO_CATEGORIES)
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

  // Campo listo para HU-16 (Cloudflare R2) — sin endpoint de subida todavía.
  @IsOptional()
  @IsUrl()
  facturaUrl?: string;
}
