import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CicloEstado, Cycle, TransaccionTipo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloseCycleDto } from './dto/close-cycle.dto';
import { CreateCycleDto } from './dto/create-cycle.dto';

@Injectable()
export class CyclesService {
  constructor(private readonly prisma: PrismaService) {}

  // HU-11: crea un ciclo en estado ACTIVO (default del schema). La finca
  // debe pertenecer a la company del usuario y estar activa — pueden
  // existir múltiples ciclos ACTIVO simultáneos, sin restricción.
  async create(companyId: string, dto: CreateCycleDto): Promise<Cycle> {
    const farm = await this.prisma.farm.findFirst({
      where: { id: dto.farmId, companyId },
    });

    if (!farm) {
      throw new BadRequestException('La finca indicada no existe o no pertenece a tu empresa.');
    }

    if (!farm.activo) {
      throw new BadRequestException('No se pueden crear ciclos sobre una finca desactivada.');
    }

    return this.prisma.cycle.create({
      data: {
        farmId: dto.farmId,
        name: dto.name,
        seedDate: new Date(dto.seedDate),
      },
    });
  }

  // HU-12: cierra un ciclo ACTIVO y calcula/almacena el snapshot de KPIs.
  // Hoy no existe el módulo de Transacciones (Épica 4) todavía, así que la
  // agregación siempre da 0 — en cuanto exista, este mismo código empieza a
  // reflejar datos reales sin cambios.
  async close(companyId: string, cycleId: string, dto: CloseCycleDto): Promise<Cycle> {
    const cycle = await this.findOwnedCycleOrThrow(companyId, cycleId);

    if (cycle.estado !== CicloEstado.ACTIVO) {
      throw new ConflictException('Este ciclo ya está cerrado.');
    }

    const [ingresos, egresos] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { cycleId, tipo: TransaccionTipo.INGRESO },
        _sum: { monto: true },
      }),
      this.prisma.transaction.aggregate({
        where: { cycleId, tipo: TransaccionTipo.EGRESO },
        _sum: { monto: true },
      }),
    ]);

    const totalIngresos = Number(ingresos._sum.monto ?? 0);
    const totalEgresos = Number(egresos._sum.monto ?? 0);
    const utilidadNeta = totalIngresos - totalEgresos;
    const margenPorcentaje = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

    return this.prisma.cycle.update({
      where: { id: cycleId },
      data: {
        estado: CicloEstado.CERRADO,
        harvestDate: new Date(dto.harvestDate),
        totalIngresos,
        totalEgresos,
        utilidadNeta,
        margenPorcentaje,
      },
    });
  }

  private async findOwnedCycleOrThrow(companyId: string, cycleId: string): Promise<Cycle> {
    const cycle = await this.prisma.cycle.findFirst({
      where: { id: cycleId, farm: { companyId } },
    });
    if (!cycle) {
      throw new NotFoundException('Ciclo no encontrado.');
    }
    return cycle;
  }
}
