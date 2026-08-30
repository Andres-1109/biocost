import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsStrongPassword()
  password!: string;

  @IsNotEmpty()
  @MaxLength(150)
  companyName!: string;
}
