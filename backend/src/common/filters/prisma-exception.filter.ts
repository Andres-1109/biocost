import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

// Traduce errores de Prisma a respuestas HTTP significativas en vez de dejar
// que se filtre un 500 con detalles internos (nombres de tabla/constraint).
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const mapped = this.mapException(exception);
    const status = mapped.getStatus();
    const body = mapped.getResponse();

    response.status(status).json(body);
  }

  private mapException(
    exception: Prisma.PrismaClientKnownRequestError,
  ): HttpException {
    switch (exception.code) {
      case 'P2002':
        return new ConflictException('El recurso ya existe.');
      case 'P2025':
        return new NotFoundException('Recurso no encontrado.');
      default:
        return new InternalServerErrorException('Error interno del servidor.');
    }
  }
}
