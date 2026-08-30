import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFarmDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
