import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  // Opcional (HU-09). Se cifra con EncryptionService antes de persistir.
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  // URL directa por ahora — el endpoint de subida prefirmada a Cloudflare R2
  // queda pendiente de credenciales (ver plan del sprint).
  @IsOptional()
  @IsUrl()
  logoUrl?: string;
}
