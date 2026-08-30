import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../auth/strategies/jwt-access.strategy';

// HU-24/HU-25: un ADMIN siempre ve el dashboard; un OPERADOR solo si su
// Membership.puedeVerDashboard es true — re-consultado fresco en cada
// request (no se confía en el rol/permiso embebido en el access token,
// que puede quedar desactualizado hasta 15 min si el admin se lo acaba de
// quitar, mismo razonamiento que en HU-18).
@Injectable()
export class DashboardAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) return false;

    if (user.role === Role.ADMIN) return true;

    const membership = await this.prisma.membership.findUnique({
      where: { id: user.membershipId },
      select: { puedeVerDashboard: true },
    });

    return !!membership?.puedeVerDashboard;
  }
}
