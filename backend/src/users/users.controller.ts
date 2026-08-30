import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../auth/strategies/jwt-access.strategy';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
