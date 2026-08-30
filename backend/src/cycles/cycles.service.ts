import { BadRequestException, Injectable } from '@nestjs/common';
import { Cycle } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
}
