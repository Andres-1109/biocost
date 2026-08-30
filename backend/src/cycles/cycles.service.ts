import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CicloEstado, Cycle, TransaccionTipo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloseCycleDto } from './dto/close-cycle.dto';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { ListCyclesQueryDto } from './dto/list-cycles-query.dto';

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
  async close(companyId: string, cycleId: string, dto: CloseCycleDto): Promise<Cycle> {
    const cycle = await this.findOwnedCycleOrThrow(companyId, cycleId);

    if (cycle.estado !== CicloEstado.ACTIVO) {
      throw new ConflictException('Este ciclo ya está cerrado.');
    }

    const { totalIngresos, totalEgresos, utilidadNeta, margenPorcentaje } =
      await this.calculateFinancials(cycleId);

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

  // HU-12/HU-24: agrega Transaction.monto por tipo para un ciclo puntual.
  // Público y reutilizado por DashboardService (HU-24) para ciclos ACTIVO
  // en vez de reimplementar esta agregación — close() también lo usa.
  async calculateFinancials(cycleId: string) {
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

    return { totalIngresos, totalEgresos, utilidadNeta, margenPorcentaje };
  }

  // HU-13: tabla comparativa filtrable (finca, rango de fechas de cosecha,
  // estado) y ordenable por cualquier columna soportada.
  async findAll(companyId: string, query: ListCyclesQueryDto) {
    const cycles = await this.prisma.cycle.findMany({
      where: {
        farm: { companyId },
        ...(query.farmId ? { farmId: query.farmId } : {}),
        estado: query.estado ?? CicloEstado.CERRADO,
        ...(query.dateFrom || query.dateTo
          ? {
              harvestDate: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
              },
            }
          : {}),
      },
      include: { farm: { select: { id: true, name: true } } },
      orderBy: { [query.sortBy ?? 'harvestDate']: query.order ?? 'desc' },
    });

    return cycles.map((cycle) => ({
      id: cycle.id,
      name: cycle.name,
      farmId: cycle.farm.id,
      farmName: cycle.farm.name,
      estado: cycle.estado,
      seedDate: cycle.seedDate,
      harvestDate: cycle.harvestDate,
      durationDays: cycle.harvestDate
        ? Math.round(
            (cycle.harvestDate.getTime() - cycle.seedDate.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null,
      utilidadNeta: cycle.utilidadNeta,
      margenPorcentaje: cycle.margenPorcentaje,
    }));
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
