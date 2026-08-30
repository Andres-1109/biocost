import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { TransaccionCategoria, TransaccionTipo } from '@prisma/client';

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsUUID()
  cycleId?: string;

  @IsOptional()
  @IsEnum(TransaccionCategoria)
  categoria?: TransaccionCategoria;

  @IsOptional()
  @IsEnum(TransaccionTipo)
  tipo?: TransaccionTipo;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
