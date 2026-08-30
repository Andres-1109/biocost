import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Insumo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInsumoDto } from './dto/create-insumo.dto';
import { UpdateInsumoDto } from './dto/update-insumo.dto';

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

  // Lookup genérico scoped por company — no filtra por activo, se usa para
  // editar/desactivar (donde el estado activo no debería importar para
  // encontrarlo) y como base de findActiveOwnedOrThrow.
  async findOwnedOrThrow(companyId: string, insumoId: string): Promise<Insumo> {
    const insumo = await this.prisma.insumo.findFirst({
      where: { id: insumoId, companyId },
    });
    if (!insumo) {
      throw new NotFoundException('Insumo no encontrado.');
    }
    return insumo;
  }

  // HU-19: un insumo desactivado no se puede referenciar en transacciones
  // o movimientos de inventario NUEVOS (HU-14, HU-20, HU-21, HU-22) — pero
  // los que ya lo referenciaban desde antes de desactivarlo quedan intactos,
  // porque nunca se borra físicamente (onDelete: Restrict en el schema).
  async findActiveOwnedOrThrow(companyId: string, insumoId: string): Promise<Insumo> {
    const insumo = await this.findOwnedOrThrow(companyId, insumoId);
    if (!insumo.activo) {
      throw new BadRequestException('Este insumo está desactivado.');
    }
    return insumo;
  }

  // HU-19: editar (nombre, unidad, umbral). No se permite cambiar
  // categoriaPadre (ver comentario en UpdateInsumoDto).
  async update(companyId: string, insumoId: string, dto: UpdateInsumoDto): Promise<Insumo> {
    await this.findOwnedOrThrow(companyId, insumoId);

    return this.prisma.insumo.update({
      where: { id: insumoId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.unidadMedidaDefault !== undefined
          ? { unidadMedidaDefault: dto.unidadMedidaDefault }
          : {}),
        ...(dto.umbralAlertaStock !== undefined
          ? { umbralAlertaStock: dto.umbralAlertaStock }
          : {}),
      },
    });
  }

  // HU-19: soft delete — nunca se borra físicamente, así que el historial
  // de movimientos donde participó (InventoryMovement.insumoId) queda intacto.
  async deactivate(companyId: string, insumoId: string): Promise<Insumo> {
    await this.findOwnedOrThrow(companyId, insumoId);

    return this.prisma.insumo.update({
      where: { id: insumoId },
      data: { activo: false, deletedAt: new Date() },
    });
  }
}
