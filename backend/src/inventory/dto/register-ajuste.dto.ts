import { IsDateString, IsNotEmpty, IsNumber, IsUUID, MaxLength } from 'class-validator';

export class RegisterAjusteDto {
  @IsUUID()
  farmId!: string;

  @IsUUID()
  insumoId!: string;

  // Puede ser positivo o negativo — HU-21 corrige tanto sobrantes como
  // faltantes de stock frente al conteo físico.
  @IsNumber()
  cantidad!: number;

  @IsNotEmpty()
  @MaxLength(255)
  motivo!: string;

  @IsDateString()
  fecha!: string;
}
