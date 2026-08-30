import { IsBoolean } from 'class-validator';

export class UpdateDashboardAccessDto {
  @IsBoolean()
  puedeVerDashboard!: boolean;
}
