import { NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { CompaniesService } from '../companies/companies.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService (HU-26)', () => {
  let prismaMock: {
    cycle: { findFirst: jest.Mock };
    transaction: { findMany: jest.Mock };
  };
  let companiesServiceMock: { findById: jest.Mock };
  let dashboardServiceMock: { getKpis: jest.Mock; getEgresosPorCategoria: jest.Mock };
  let reportsService: ReportsService;

  const companyId = 'company-1';
  const cycleId = 'cycle-1';

  const txRow = {
    id: 'tx-1',
    tipo: 'EGRESO',
    categoria: 'MANO_DE_OBRA',
    monto: 500_000,
    cantidad: null,
    unidadMedida: null,
    descripcion: 'Pago semanal',
    fecha: new Date('2026-04-10'),
    createdByMembership: { user: { name: 'Admin Demo' } },
  };

  beforeEach(() => {
    prismaMock = {
      cycle: { findFirst: jest.fn().mockResolvedValue({ id: cycleId, name: 'Ciclo Test' }) },
      transaction: { findMany: jest.fn().mockResolvedValue([txRow]) },
    };
    companiesServiceMock = {
      findById: jest.fn().mockResolvedValue({
        name: 'La Bendición',
        nit: '900123456-7',
        address: 'Tasajera, Magdalena',
        phone: '3001234567',
        logoUrl: null,
      }),
    };
    dashboardServiceMock = {
      getKpis: jest.fn().mockResolvedValue({
        totalIngresos: 1_000_000,
        totalEgresos: 500_000,
        utilidadNeta: 500_000,
        margenPorcentaje: 50,
        costoPorKgProducido: null,
      }),
      getEgresosPorCategoria: jest
        .fn()
        .mockResolvedValue([{ categoria: 'MANO_DE_OBRA', monto: 500_000 }]),
    };
    reportsService = new ReportsService(
      prismaMock as unknown as PrismaService,
      companiesServiceMock as unknown as CompaniesService,
      dashboardServiceMock as unknown as DashboardService,
    );
  });

  describe('exportExcel', () => {
    it('genera un .xlsx válido con una fila por transacción', async () => {
      const buffer = await reportsService.exportExcel(companyId, cycleId);

      expect(buffer.length).toBeGreaterThan(0);

      // Round-trip: se lee el buffer generado con exceljs para verificar
      // el contenido real, no solo que "algo" se produjo.
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      expect(sheet.getRow(1).getCell(1).value).toBe('Fecha'); // header
      expect(sheet.getRow(2).getCell(4).value).toBe(500_000); // monto de la única transacción
      expect(sheet.getRow(2).getCell(8).value).toBe('Admin Demo'); // registradoPor
    });

    it('rechaza con 404 si el ciclo no pertenece a la company', async () => {
      prismaMock.cycle.findFirst.mockResolvedValue(null);
      await expect(reportsService.exportExcel(companyId, 'cycle-ajeno')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('exportPdf', () => {
    it('genera un PDF válido (magic bytes %PDF) reutilizando company/kpis/egresos', async () => {
      const buffer = await reportsService.exportPdf(companyId, cycleId);

      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(companiesServiceMock.findById).toHaveBeenCalledWith(companyId);
      expect(dashboardServiceMock.getKpis).toHaveBeenCalledWith(companyId, { cycleId });
      expect(dashboardServiceMock.getEgresosPorCategoria).toHaveBeenCalledWith(companyId, {
        cycleId,
      });
    });

    it('genera un PDF válido incluso sin egresos (sin dividir por cero en la torta)', async () => {
      dashboardServiceMock.getEgresosPorCategoria.mockResolvedValue([]);
      const buffer = await reportsService.exportPdf(companyId, cycleId);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('rechaza con 404 si el ciclo no pertenece a la company', async () => {
      prismaMock.cycle.findFirst.mockResolvedValue(null);
      await expect(reportsService.exportPdf(companyId, 'cycle-ajeno')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
