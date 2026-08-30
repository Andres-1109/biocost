import { IsOptional, IsPositive, MaxLength } from 'class-validator';

// No se permite cambiar categoriaPadre: rompería la validación
// categoría↔insumo que ya usa TransactionsService (HU-14). Si el insumo
// cambia de categoría, se desactiva y se crea uno nuevo.
export class UpdateInsumoDto {
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @MaxLength(30)
  unidadMedidaDefault?: string;

  @IsOptional()
  @IsPositive()
  umbralAlertaStock?: number;
}
