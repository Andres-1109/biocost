import { Injectable } from '@nestjs/common';
import { Prisma, Company } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

// Alcance mínimo para este sprint: solo lo que HU-01 (registro) necesita.
// El CRUD completo de empresa (HU-09) llega en la Épica 2.
@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: { name: string },
    client: PrismaClientOrTx = this.prisma,
  ): Promise<Company> {
    return client.company.create({ data });
  }
}
