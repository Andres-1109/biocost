import { IsNotEmpty } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';

export class ResetPasswordDto {
  @IsNotEmpty()
  token!: string;

  @IsStrongPassword()
  newPassword!: string;
}
