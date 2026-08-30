import { IsOptional, IsUUID } from 'class-validator';

export class GetKpisQueryDto {
  // Si viene: KPIs de ese ciclo puntual. Si no: consolidado de todos los
  // ciclos ACTIVO de la company (HU-24: "selector para ver KPIs de un
  // ciclo específico o consolidado de todos los ciclos activos").
  @IsOptional()
  @IsUUID()
  cycleId?: string;
}
