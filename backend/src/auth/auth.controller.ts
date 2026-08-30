import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SelectMembershipDto } from './dto/select-membership.dto';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    if ('needsMembershipSelection' in result) {
      return result;
    }

    const { refreshToken, ...body } = result;
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  @Post('select-membership')
  @HttpCode(HttpStatus.OK)
  async selectMembership(
    @Body() dto: SelectMembershipDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.selectMembership(dto);
    const { refreshToken, ...body } = result;
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  private setRefreshCookie(res: Response, token: string) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/auth',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
  }
}
