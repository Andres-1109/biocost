import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Company } from '@prisma/client';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(
    data: { name: string },
    client: PrismaClientOrTx = this.prisma,
  ): Promise<Company> {
    return client.company.create({ data });
  }

  // HU-09: perfil de la empresa del admin autenticado. El NIT se descifra
  // aquí — nunca se expone nitEncrypted crudo fuera de este service.
  async findById(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada.');
    }

    return this.toProfile(company);
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    const data: Prisma.CompanyUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.nit !== undefined) {
      data.nitEncrypted = dto.nit === '' ? null : this.encryptionService.encrypt(dto.nit);
    }

    const company = await this.prisma.company.update({
      where: { id: companyId },
      data,
    });

    return this.toProfile(company);
  }

  private toProfile(company: Company) {
    return {
      id: company.id,
      name: company.name,
      nit: company.nitEncrypted
        ? this.encryptionService.decrypt(company.nitEncrypted)
        : null,
      address: company.address,
      phone: company.phone,
      logoUrl: company.logoUrl,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }
}
