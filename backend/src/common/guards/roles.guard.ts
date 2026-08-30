import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../../auth/strategies/jwt-access.strategy';

// Rechaza el request si el rol del Membership autenticado (JwtAuthGuard debe
// correr antes) no está en la lista de @Roles(...) del handler. Esta es la
// única barrera que impide que un OPERADOR escale su propio puedeVerDashboard
// (HU-08) o el de otro — nunca se confía en el rol que venga del body/params.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;

    return !!user && requiredRoles.includes(user.role as Role);
  }
}
