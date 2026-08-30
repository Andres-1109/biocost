import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // HU-06: admin crea un operador para su empresa.
  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createOperator(
    @CurrentUser() currentUser: RequestUser,
    @Body() dto: CreateOperatorDto,
  ) {
    return this.usersService.createOperator(currentUser.companyId, dto);
  }

  // HU-03: admin revoca todas las sesiones activas de un usuario de su empresa.
  @Post(':userId/revoke-sessions')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  revokeSessions(
    @CurrentUser() currentUser: RequestUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.revokeSessions(currentUser.companyId, userId);
  }
}
