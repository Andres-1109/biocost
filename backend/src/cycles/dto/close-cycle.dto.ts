import { IsDateString } from 'class-validator';

export class CloseCycleDto {
  @IsDateString()
  harvestDate!: string;
}
