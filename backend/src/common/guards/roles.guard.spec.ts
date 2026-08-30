import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../../auth/strategies/jwt-access.strategy';

function buildContext(user: RequestUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function buildReflector(requiredRoles: Role[] | undefined): Reflector {
  return {
    getAllAndOverride: () => requiredRoles,
  } as unknown as Reflector;
}

// Test de seguridad crítico (HU-08): un OPERADOR jamás debe poder alcanzar
// un endpoint @Roles(ADMIN) — en particular PATCH
// /users/:membershipId/dashboard-access, donde un Operador podría intentar
// auto-escalar su propio puedeVerDashboard (o el de otro). Esta es la única
// barrera real: si el guard fallara, el controller no tiene ninguna otra
// verificación de rol.
describe('RolesGuard (HU-08 — anti-escalación de privilegios)', () => {
  it('rechaza (false) a un OPERADOR en un endpoint @Roles(ADMIN)', () => {
    const guard = new RolesGuard(buildReflector([Role.ADMIN]));
    const context = buildContext({
      userId: 'user-operador',
      membershipId: 'membership-operador',
      companyId: 'company-1',
      role: Role.OPERADOR,
    });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('rechaza (false) a un OPERADOR incluso intentando modificar su PROPIO membership', () => {
    const guard = new RolesGuard(buildReflector([Role.ADMIN]));
    // El "atacante" es el mismo membership que aparece en la URL — el guard
    // debe rechazar por rol, sin importar que sea su propio recurso.
    const context = buildContext({
      userId: 'user-operador',
      membershipId: 'membership-operador',
      companyId: 'company-1',
      role: Role.OPERADOR,
    });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('permite (true) a un ADMIN en el mismo endpoint', () => {
    const guard = new RolesGuard(buildReflector([Role.ADMIN]));
    const context = buildContext({
      userId: 'user-admin',
      membershipId: 'membership-admin',
      companyId: 'company-1',
      role: Role.ADMIN,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rechaza (false) si no hay usuario autenticado en el request', () => {
    const guard = new RolesGuard(buildReflector([Role.ADMIN]));
    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });

  it('permite (true) endpoints sin @Roles() (sin restricción de rol)', () => {
    const guard = new RolesGuard(buildReflector(undefined));
    const context = buildContext({
      userId: 'user-operador',
      membershipId: 'membership-operador',
      companyId: 'company-1',
      role: Role.OPERADOR,
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
