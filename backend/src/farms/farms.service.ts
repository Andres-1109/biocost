import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CicloEstado, Farm } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';

@Injectable()
export class FarmsService {
  constructor(private readonly prisma: PrismaService) {}

  // HU-10: una Company puede tener 1+ Farm.
  async create(companyId: string, dto: CreateFarmDto): Promise<Farm> {
    return this.prisma.farm.create({
      data: { companyId, name: dto.name, location: dto.location },
    });
  }

  // Incluye activas e inactivas — el frontend decide qué mostrar (ej. un
  // selector de finca al crear un Ciclo solo debería ofrecer las activas).
  async findAllByCompany(companyId: string): Promise<Farm[]> {
    return this.prisma.farm.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(companyId: string, farmId: string, dto: UpdateFarmDto): Promise<Farm> {
    await this.findOwnedFarmOrThrow(companyId, farmId);

    return this.prisma.farm.update({
      where: { id: farmId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
      },
    });
  }

  // HU-10: solo se puede desactivar si no tiene ciclos ACTIVO asociados.
  async deactivate(companyId: string, farmId: string): Promise<Farm> {
    await this.findOwnedFarmOrThrow(companyId, farmId);

    const activeCycles = await this.prisma.cycle.count({
      where: { farmId, estado: CicloEstado.ACTIVO },
    });

    if (activeCycles > 0) {
      throw new ConflictException(
        `Esta finca tiene ${activeCycles} ciclo(s) activo(s) asociado(s). Cierra esos ciclos antes de desactivarla.`,
      );
    }

    return this.prisma.farm.update({
      where: { id: farmId },
      data: { activo: false, deletedAt: new Date() },
    });
  }

  private async findOwnedFarmOrThrow(companyId: string, farmId: string): Promise<Farm> {
    const farm = await this.prisma.farm.findFirst({
      where: { id: farmId, companyId },
    });
    if (!farm) {
      throw new NotFoundException('Finca no encontrada.');
    }
    return farm;
  }
}
