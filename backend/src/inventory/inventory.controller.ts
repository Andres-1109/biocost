import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { RegisterAjusteDto } from './dto/register-ajuste.dto';
import { RegisterConsumoDto } from './dto/register-consumo.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // HU-21: solo Admin puede registrar ajustes manuales.
  @Post('ajustes')
  @Roles(Role.ADMIN)
  registerAjuste(@CurrentUser() currentUser: RequestUser, @Body() dto: RegisterAjusteDto) {
    return this.inventoryService.registerAjusteManual(currentUser, dto);
  }

  // HU-22: Administrador u Operador registran el consumo de un insumo en
  // un ciclo (ej. alimentar peces con stock ya comprado).
  @Post('consumos')
  registerConsumo(@CurrentUser() currentUser: RequestUser, @Body() dto: RegisterConsumoDto) {
    return this.inventoryService.registerConsumo(currentUser, dto);
  }

  // HU-21: historial de movimientos — ADMIN-only (vista de gestión/auditoría).
  @Get('movements')
  @Roles(Role.ADMIN)
  findMovements(
    @CurrentUser() currentUser: RequestUser,
    @Query() query: ListMovementsQueryDto,
  ) {
    return this.inventoryService.findMovements(currentUser.companyId, query);
  }
}
