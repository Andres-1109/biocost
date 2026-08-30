import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { CicloEstado } from '@prisma/client';

const SORTABLE_FIELDS = ['utilidadNeta', 'margenPorcentaje', 'seedDate', 'harvestDate'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

export class ListCyclesQueryDto {
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // HU-13: "todos mis ciclos cerrados" — default CERRADO, mostrar ACTIVO
  // es una extensión razonable vía query param, no un requisito de la HU.
  @IsOptional()
  @IsEnum(CicloEstado)
  estado?: CicloEstado = CicloEstado.CERRADO;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy?: SortableField = 'harvestDate';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}
