import { ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { HashService } from '../common/crypto/hash.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: HashService,
  ) {}

  // HU-01: crea User + Company + Membership(ADMIN) de forma atómica.
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('El email ya está registrado.');
    }

    const passwordHash = await this.hashService.hash(dto.password);

    const { user, company, membership } = await this.prisma.$transaction(
      async (tx) => {
        const company = await tx.company.create({
          data: { name: dto.companyName },
        });

        const user = await tx.user.create({
          data: {
            email: dto.email,
            name: dto.name,
            passwordHash,
          },
        });

        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            companyId: company.id,
            role: Role.ADMIN,
          },
        });

        return { user, company, membership };
      },
    );

    return {
      user: { id: user.id, email: user.email, name: user.name },
      company: { id: company.id, name: company.name },
      membership: { id: membership.id, role: membership.role },
    };
  }
}
