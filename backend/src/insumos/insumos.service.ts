import { Injectable, NotFoundException } from '@nestjs/common';
import { Insumo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInsumoDto } from './dto/create-insumo.dto';

// Alcance mínimo para este sprint: solo lo que HU-14 necesita para poder
// referenciar un insumo específico al registrar un egreso. El catálogo
// completo (editar, desactivar preservando historial de movimientos,
// umbral configurable desde el panel) es HU-19 en Épica 5 — depende de
// InventoryMovement, que todavía no existe.
@Injectable()
export class InsumosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateInsumoDto): Promise<Insumo> {
    return this.prisma.insumo.create({
      data: {
        companyId,
        name: dto.name,
        categoriaPadre: dto.categoriaPadre,
        unidadMedidaDefault: dto.unidadMedidaDefault,
        umbralAlertaStock: dto.umbralAlertaStock,
      },
    });
  }

  async findAllByCompany(companyId: string): Promise<Insumo[]> {
    return this.prisma.insumo.findMany({
      where: { companyId, activo: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOwnedOrThrow(companyId: string, insumoId: string): Promise<Insumo> {
    const insumo = await this.prisma.insumo.findFirst({
      where: { id: insumoId, companyId },
    });
    if (!insumo) {
      throw new NotFoundException('Insumo no encontrado.');
    }
    return insumo;
  }
}
