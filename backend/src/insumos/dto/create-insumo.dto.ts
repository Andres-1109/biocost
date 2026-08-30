import { IsEnum, IsNotEmpty, IsOptional, IsPositive, MaxLength } from 'class-validator';
import { InsumoCategoriaPadre } from '@prisma/client';

export class CreateInsumoDto {
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsEnum(InsumoCategoriaPadre)
  categoriaPadre!: InsumoCategoriaPadre;

  @IsNotEmpty()
  @MaxLength(30)
  unidadMedidaDefault!: string;

  // Umbral de alerta de stock bajo (HU-19, HU-23) — opcional, se puede
  // configurar después desde el catálogo completo.
  @IsOptional()
  @IsPositive()
  umbralAlertaStock?: number;
}
