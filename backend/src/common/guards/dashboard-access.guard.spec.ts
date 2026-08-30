import { ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../../auth/strategies/jwt-access.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardAccessGuard } from './dashboard-access.guard';

function buildContext(user: RequestUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

// HU-24/HU-25: la única barrera real que impide que un Operador sin
// permiso vea KPIs/gráficos de rentabilidad.
describe('DashboardAccessGuard', () => {
  let prismaMock: { membership: { findUnique: jest.Mock } };
  let guard: DashboardAccessGuard;

  beforeEach(() => {
    prismaMock = { membership: { findUnique: jest.fn() } };
    guard = new DashboardAccessGuard(prismaMock as unknown as PrismaService);
  });

  it('permite siempre a un ADMIN, sin consultar la DB', async () => {
    const context = buildContext({
      userId: 'u1',
      membershipId: 'm1',
      companyId: 'c1',
      role: Role.ADMIN,
    });
    expect(await guard.canActivate(context)).toBe(true);
    expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
  });

  it('permite a un OPERADOR con puedeVerDashboard=true (consultado fresco)', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ puedeVerDashboard: true });
    const context = buildContext({
      userId: 'u1',
      membershipId: 'm1',
      companyId: 'c1',
      role: Role.OPERADOR,
    });
    expect(await guard.canActivate(context)).toBe(true);
    expect(prismaMock.membership.findUnique).toHaveBeenCalledWith({
      where: { id: 'm1' },
      select: { puedeVerDashboard: true },
    });
  });

  it('rechaza a un OPERADOR con puedeVerDashboard=false', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ puedeVerDashboard: false });
    const context = buildContext({
      userId: 'u1',
      membershipId: 'm1',
      companyId: 'c1',
      role: Role.OPERADOR,
    });
    expect(await guard.canActivate(context)).toBe(false);
  });

  it('rechaza si no hay usuario autenticado en el request', async () => {
    expect(await guard.canActivate(buildContext(undefined))).toBe(false);
  });
});
