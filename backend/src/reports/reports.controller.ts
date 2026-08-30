import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportsService } from './reports.service';

// HU-26: "Como Administrador, quiero exportar..." — sin la salvedad de
// puedeVerDashboard de HU-08 (a diferencia de HU-24/HU-25). ADMIN-only
// estricto vía RolesGuard, no DashboardAccessGuard.
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('cycles/:id/excel')
  async exportExcel(
    @CurrentUser() currentUser: RequestUser,
    @Param('id') cycleId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.exportExcel(currentUser.companyId, cycleId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ciclo-${cycleId}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('cycles/:id/pdf')
  async exportPdf(
    @CurrentUser() currentUser: RequestUser,
    @Param('id') cycleId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.exportPdf(currentUser.companyId, cycleId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ciclo-${cycleId}.pdf"`,
    });
    res.send(buffer);
  }
}
