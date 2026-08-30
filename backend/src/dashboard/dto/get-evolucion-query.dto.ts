import { IsUUID } from 'class-validator';

// A diferencia de los otros gráficos, la evolución de utilidad es
// "a lo largo de UN ciclo activo" (HU-25) — cycleId es obligatorio aquí.
export class GetEvolucionQueryDto {
  @IsUUID()
  cycleId!: string;
}
