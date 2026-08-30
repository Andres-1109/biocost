import { Injectable, NotFoundException } from '@nestjs/common';
import { CicloEstado, TransaccionCategoria, TransaccionTipo } from '@prisma/client';
import { CyclesService } from '../cycles/cycles.service';
import { PrismaService } from '../prisma/prisma.service';
import { GetKpisQueryDto } from './dto/get-kpis-query.dto';

interface Financials {
  totalIngresos: number;
  totalEgresos: number;
  utilidadNeta: number;
  margenPorcentaje: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cyclesService: CyclesService,
  ) {}

  // HU-24: KPIs de un ciclo puntual (?cycleId=) o consolidado de todos los
  // ciclos ACTIVO de la company si no se especifica ninguno.
  async getKpis(companyId: string, query: GetKpisQueryDto) {
    if (query.cycleId) {
      return this.getSingleCycleKpis(companyId, query.cycleId);
    }
    return this.getConsolidatedKpis(companyId);
  }

  private async getSingleCycleKpis(companyId: string, cycleId: string) {
    const cycle = await this.prisma.cycle.findFirst({
      where: { id: cycleId, farm: { companyId } },
    });
    if (!cycle) {
      throw new NotFoundException('Ciclo no encontrado.');
    }

    // CERRADO: lee el snapshot ya guardado por HU-12, no recalcula.
    // ACTIVO: cálculo en vivo, reutilizando CyclesService.calculateFinancials.
    const financials: Financials =
      cycle.estado === CicloEstado.CERRADO
        ? {
            totalIngresos: Number(cycle.totalIngresos ?? 0),
            totalEgresos: Number(cycle.totalEgresos ?? 0),
            utilidadNeta: Number(cycle.utilidadNeta ?? 0),
            margenPorcentaje: Number(cycle.margenPorcentaje ?? 0),
          }
        : await this.cyclesService.calculateFinancials(cycleId);

    const kgVendidos = await this.getKgVendidos({ cycleId });

    return this.toKpisResponse(cycleId, cycle.estado, financials, kgVendidos);
  }

  private async getConsolidatedKpis(companyId: string) {
    const activeCycles = await this.prisma.cycle.findMany({
      where: { farm: { companyId }, estado: CicloEstado.ACTIVO },
      select: { id: true },
    });
    const cycleIds = activeCycles.map((c) => c.id);

    if (cycleIds.length === 0) {
      return this.toKpisResponse(
        null,
        null,
        { totalIngresos: 0, totalEgresos: 0, utilidadNeta: 0, margenPorcentaje: 0 },
        0,
        0,
      );
    }

    const [ingresos, egresos] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { cycleId: { in: cycleIds }, tipo: TransaccionTipo.INGRESO },
        _sum: { monto: true },
      }),
      this.prisma.transaction.aggregate({
        where: { cycleId: { in: cycleIds }, tipo: TransaccionTipo.EGRESO },
        _sum: { monto: true },
      }),
    ]);

    const totalIngresos = Number(ingresos._sum.monto ?? 0);
    const totalEgresos = Number(egresos._sum.monto ?? 0);
    const utilidadNeta = totalIngresos - totalEgresos;
    const margenPorcentaje = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

    const kgVendidos = await this.getKgVendidos({ cycleIdIn: cycleIds });

    return this.toKpisResponse(
      null,
      'CONSOLIDADO',
      { totalIngresos, totalEgresos, utilidadNeta, margenPorcentaje },
      kgVendidos,
      cycleIds.length,
    );
  }

  // "Costo por kg producido" (HU-24) no tiene campo persistido en el
  // snapshot de Cycle — se usa como proxy los kg vendidos (Transaction de
  // categoría VENTA_PESCADO en unidad kg). Se calcula siempre en vivo,
  // incluso para ciclos CERRADO: sus transacciones son inmutables (HU-17
  // solo permite editar ciclos ACTIVO), así que es estable.
  private async getKgVendidos(
    scope: { cycleId: string } | { cycleIdIn: string[] },
  ): Promise<number> {
    const cycleFilter = 'cycleId' in scope ? { cycleId: scope.cycleId } : { cycleId: { in: scope.cycleIdIn } };

    const result = await this.prisma.transaction.aggregate({
      where: {
        ...cycleFilter,
        tipo: TransaccionTipo.INGRESO,
        categoria: TransaccionCategoria.VENTA_PESCADO,
        unidadMedida: { equals: 'kg', mode: 'insensitive' },
      },
      _sum: { cantidad: true },
    });

    return Number(result._sum.cantidad ?? 0);
  }

  private toKpisResponse(
    cycleId: string | null,
    estado: string | null,
    financials: Financials,
    kgVendidos: number,
    cyclesCount?: number,
  ) {
    return {
      cycleId,
      estado,
      ...financials,
      costoTotal: financials.totalEgresos,
      kgVendidos,
      costoPorKgProducido: kgVendidos > 0 ? financials.totalEgresos / kgVendidos : null,
      ...(cyclesCount !== undefined ? { cyclesCount } : {}),
    };
  }
}
