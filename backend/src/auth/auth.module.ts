import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CommonModule } from '../common/common.module';
import { CompaniesModule } from '../companies/companies.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';

@Module({
  imports: [
    CommonModule,
    CompaniesModule,
    UsersModule,
    PassportModule,
    JwtModule.register({}), // sin secret por defecto: cada firma pasa su propio secret/expiresIn
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessStrategy],
  exports: [AuthService],
})
export class AuthModule {}
