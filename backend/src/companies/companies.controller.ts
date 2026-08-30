import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

// HU-09: cada admin gestiona únicamente su propia empresa — companyId sale
// siempre del JWT, nunca de la URL, así que no hace falta (ni se permite)
// un :id en estas rutas.
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('me')
  getMyCompany(@CurrentUser() currentUser: RequestUser) {
    return this.companiesService.findById(currentUser.companyId);
  }

  @Patch('me')
  updateMyCompany(
    @CurrentUser() currentUser: RequestUser,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(currentUser.companyId, dto);
  }
}
