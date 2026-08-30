import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntidad, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  companyId: string;
  userId: string;
  action: AuditAction;
  entidad: AuditEntidad;
  entidadId: string;
  valoresAntes?: Prisma.InputJsonValue;
  valoresDespues?: Prisma.InputJsonValue;
}

// Alcance mínimo para este sprint: solo escritura, para que HU-17 pueda
// dejar rastro de cada edición/eliminación de transacción. El modelo
// AuditLog ya existe completo desde Sprint 0. La lectura (pantalla de
// "Historial de auditoría" para el Admin) es HU-32 en Épica 8 — tiene más
// sentido junto con los ajustes manuales de inventario, que también hay
// que auditar y todavía no existen (Épica 5).
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        companyId: entry.companyId,
        userId: entry.userId,
        action: entry.action,
        entidad: entry.entidad,
        entidadId: entry.entidadId,
        valoresAntes: entry.valoresAntes,
        valoresDespues: entry.valoresDespues,
      },
    });
  }
}
