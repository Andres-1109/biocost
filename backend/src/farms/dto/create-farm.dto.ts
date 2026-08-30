import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFarmDto {
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
