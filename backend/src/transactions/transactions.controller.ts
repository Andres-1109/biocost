import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateEgresoDto } from './dto/create-egreso.dto';
import { CreateIngresoDto } from './dto/create-ingreso.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // HU-14: Administrador u Operador pueden registrar egresos.
  @Post('egresos')
  createEgreso(@CurrentUser() currentUser: RequestUser, @Body() dto: CreateEgresoDto) {
    return this.transactionsService.createEgreso(currentUser, dto);
  }

  // HU-15: Administrador u Operador pueden registrar ingresos.
  @Post('ingresos')
  createIngreso(@CurrentUser() currentUser: RequestUser, @Body() dto: CreateIngresoDto) {
    return this.transactionsService.createIngreso(currentUser, dto);
  }

  // HU-17: un Operador jamás puede editar/eliminar, ni siquiera lo suyo.
  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() currentUser: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(currentUser, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() currentUser: RequestUser, @Param('id') id: string) {
    return this.transactionsService.remove(currentUser, id);
  }

  // HU-18: historial con filtros. Sin @Roles() — el scoping (propio vs.
  // consolidado) lo resuelve el service según rol y puedeVerDashboard.
  @Get()
  findAll(
    @CurrentUser() currentUser: RequestUser,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactionsService.findAll(currentUser, query);
  }
}
