import { IsEmail, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';

export class CreateOperatorDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  // Opcional: si el admin no la especifica, se genera una temporal y se envía por email (HU-06).
  @IsOptional()
  @IsStrongPassword()
  password?: string;
}
