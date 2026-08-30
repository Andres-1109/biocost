import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { CompaniesModule } from './companies/companies.module';
import { CyclesModule } from './cycles/cycles.module';
import { FarmsModule } from './farms/farms.module';
import { InsumosModule } from './insumos/insumos.module';
import { PrismaModule } from './prisma/prisma.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
    PrismaModule,
    CommonModule,
    CompaniesModule,
    FarmsModule,
    CyclesModule,
    InsumosModule,
    TransactionsModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
