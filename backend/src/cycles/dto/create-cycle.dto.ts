import { IsDateString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';

export class CreateCycleDto {
  @IsUUID()
  farmId!: string;

  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsDateString()
  seedDate!: string;
}
