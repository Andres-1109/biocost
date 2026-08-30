import { IsOptional, IsUUID } from 'class-validator';

export class ListStockQueryDto {
  @IsOptional()
  @IsUUID()
  farmId?: string;
}
