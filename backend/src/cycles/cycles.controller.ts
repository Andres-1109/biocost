import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CyclesService } from './cycles.service';
import { CloseCycleDto } from './dto/close-cycle.dto';
import { CreateCycleDto } from './dto/create-cycle.dto';

@Controller('cycles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  // HU-11: Administrador u Operador pueden crear ciclos — sin @Roles().
  @Post()
  create(@CurrentUser() currentUser: RequestUser, @Body() dto: CreateCycleDto) {
    return this.cyclesService.create(currentUser.companyId, dto);
  }

  // HU-12: solo el Admin puede cerrar un ciclo.
  @Patch(':id/close')
  @Roles(Role.ADMIN)
  close(
    @CurrentUser() currentUser: RequestUser,
    @Param('id') id: string,
    @Body() dto: CloseCycleDto,
  ) {
    return this.cyclesService.close(currentUser.companyId, id, dto);
  }
}
