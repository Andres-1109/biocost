import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CyclesService } from './cycles.service';
import { CreateCycleDto } from './dto/create-cycle.dto';

@Controller('cycles')
@UseGuards(JwtAuthGuard)
export class CyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  // HU-11: Administrador u Operador pueden crear ciclos — sin @Roles().
  @Post()
  create(@CurrentUser() currentUser: RequestUser, @Body() dto: CreateCycleDto) {
    return this.cyclesService.create(currentUser.companyId, dto);
  }
}
