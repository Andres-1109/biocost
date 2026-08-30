import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateEgresoDto } from './dto/create-egreso.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // HU-14: Administrador u Operador pueden registrar egresos.
  @Post('egresos')
  createEgreso(@CurrentUser() currentUser: RequestUser, @Body() dto: CreateEgresoDto) {
    return this.transactionsService.createEgreso(currentUser, dto);
  }
}
