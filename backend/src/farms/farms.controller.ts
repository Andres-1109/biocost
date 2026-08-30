import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { FarmsService } from './farms.service';

@Controller('farms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() currentUser: RequestUser, @Body() dto: CreateFarmDto) {
    return this.farmsService.create(currentUser.companyId, dto);
  }

  // Sin @Roles(): un Operador también necesita ver las fincas para elegir
  // una al crear un Ciclo (HU-11).
  @Get()
  findAll(@CurrentUser() currentUser: RequestUser) {
    return this.farmsService.findAllByCompany(currentUser.companyId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() currentUser: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateFarmDto,
  ) {
    return this.farmsService.update(currentUser.companyId, id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN)
  deactivate(@CurrentUser() currentUser: RequestUser, @Param('id') id: string) {
    return this.farmsService.deactivate(currentUser.companyId, id);
  }
}
