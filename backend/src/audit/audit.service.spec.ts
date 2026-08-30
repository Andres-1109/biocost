import { AuditAction, AuditEntidad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService.record (prep HU-17 / HU-32)', () => {
  let prismaMock: { auditLog: { create: jest.Mock } };
  let auditService: AuditService;

  beforeEach(() => {
    prismaMock = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    auditService = new AuditService(prismaMock as unknown as PrismaService);
  });

  it('guarda la entrada de auditoría con los valores antes/después', async () => {
    await auditService.record({
      companyId: 'company-1',
      userId: 'user-1',
      action: AuditAction.EDITAR,
      entidad: AuditEntidad.TRANSACCION,
      entidadId: 'tx-1',
      valoresAntes: { monto: 100 },
      valoresDespues: { monto: 200 },
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        userId: 'user-1',
        action: AuditAction.EDITAR,
        entidad: AuditEntidad.TRANSACCION,
        entidadId: 'tx-1',
        valoresAntes: { monto: 100 },
        valoresDespues: { monto: 200 },
      },
    });
  });
});
