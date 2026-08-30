import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// Mismos 3 filtros en los 3 endpoints de gráficos (HU-25: "todos los
// gráficos respetan los filtros de fecha/ciclo aplicados").
export class ChartFiltersDto {
  @IsOptional()
  @IsUUID()
  cycleId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
