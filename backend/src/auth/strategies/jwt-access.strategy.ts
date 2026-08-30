import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface AccessTokenPayload {
  sub: string; // userId
  membershipId: string;
  companyId: string;
  role: 'ADMIN' | 'OPERADOR';
  purpose: 'access';
}

export interface RequestUser {
  userId: string;
  membershipId: string;
  companyId: string;
  role: 'ADMIN' | 'OPERADOR';
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): RequestUser {
    // Defensa en profundidad: un token firmado con otro propósito (ej. de
    // selección de empresa) no debe poder usarse como access token aunque
    // comparta forma con este payload.
    if (payload.purpose !== 'access') {
      throw new UnauthorizedException('Token inválido.');
    }
    return {
      userId: payload.sub,
      membershipId: payload.membershipId,
      companyId: payload.companyId,
      role: payload.role,
    };
  }
}
