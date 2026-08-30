import { IsDateString, IsPositive, IsUUID } from 'class-validator';

export class RegisterConsumoDto {
  @IsUUID()
  insumoId!: string;

  // El farmId se deriva del ciclo — nunca se confía en uno que mande el
  // cliente, para que no pueda apuntar el consumo a una finca ajena.
  @IsUUID()
  cycleId!: string;

  @IsPositive()
  cantidad!: number;

  @IsDateString()
  fecha!: string;
}
