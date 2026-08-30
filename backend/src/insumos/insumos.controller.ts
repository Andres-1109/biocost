import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateInsumoDto } from './dto/create-insumo.dto';
import { InsumosService } from './insumos.service';

@Controller('insumos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsumosController {
  constructor(private readonly insumosService: InsumosService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() currentUser: RequestUser, @Body() dto: CreateInsumoDto) {
    return this.insumosService.create(currentUser.companyId, dto);
  }

  // Sin @Roles(): un Operador necesita ver el catálogo para elegir un
  // insumo al registrar un egreso de Alimento/Químicos (HU-14).
  @Get()
  findAll(@CurrentUser() currentUser: RequestUser) {
    return this.insumosService.findAllByCompany(currentUser.companyId);
  }
}
