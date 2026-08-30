import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DashboardAccessGuard } from '../common/guards/dashboard-access.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
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
}
