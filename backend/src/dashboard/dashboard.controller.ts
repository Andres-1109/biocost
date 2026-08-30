import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DashboardAccessGuard } from '../common/guards/dashboard-access.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { ChartFiltersDto } from './dto/chart-filters.dto';
import { GetEvolucionQueryDto } from './dto/get-evolucion-query.dto';
import { GetKpisQueryDto } from './dto/get-kpis-query.dto';

// HU-24/HU-25: DashboardAccessGuard (no RolesGuard) — ADMIN siempre,
// OPERADOR solo con puedeVerDashboard=true.
@Controller('dashboard')
@UseGuards(JwtAuthGuard, DashboardAccessGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  getKpis(@CurrentUser() currentUser: RequestUser, @Query() query: GetKpisQueryDto) {
    return this.dashboardService.getKpis(currentUser.companyId, query);
  }

  // HU-25: gráfico de barras — ingresos vs egresos por mes.
  @Get('charts/ingresos-egresos-mensuales')
  getIngresosEgresosPorMes(
    @CurrentUser() currentUser: RequestUser,
    @Query() query: ChartFiltersDto,
  ) {
    return this.dashboardService.getIngresosEgresosPorMes(currentUser.companyId, query);
  }

  // HU-25: gráfico de línea — evolución de utilidad de un ciclo.
  @Get('charts/utilidad-evolucion')
  getEvolucionUtilidad(
    @CurrentUser() currentUser: RequestUser,
    @Query() query: GetEvolucionQueryDto,
  ) {
    return this.dashboardService.getEvolucionUtilidad(currentUser.companyId, query.cycleId);
  }

  // HU-25: gráfico de torta — distribución de egresos por categoría.
  @Get('charts/egresos-por-categoria')
  getEgresosPorCategoria(
    @CurrentUser() currentUser: RequestUser,
    @Query() query: ChartFiltersDto,
  ) {
    return this.dashboardService.getEgresosPorCategoria(currentUser.companyId, query);
  }
}
