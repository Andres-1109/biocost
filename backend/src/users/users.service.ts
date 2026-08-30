import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(
    email: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<User | null> {
    return client.user.findUnique({ where: { email } });
  }

  async create(
    data: { email: string; name: string; passwordHash: string },
    client: PrismaClientOrTx = this.prisma,
  ): Promise<User> {
    return client.user.create({ data });
  }
}
