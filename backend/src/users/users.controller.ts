import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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

  // HU-07: admin lista los miembros de su empresa para gestionarlos.
  @Get()
  @Roles(Role.ADMIN)
  listMemberships(@CurrentUser() currentUser: RequestUser) {
    return this.usersService.listMemberships(currentUser.companyId);
  }

  // HU-07: admin desactiva (soft delete) a un operador de su empresa.
  @Patch(':membershipId/deactivate')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  deactivateOperator(
    @CurrentUser() currentUser: RequestUser,
    @Param('membershipId') membershipId: string,
  ) {
    return this.usersService.deactivateOperator(currentUser.companyId, membershipId);
  }
}
