import { IsNotEmpty } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';

export class ChangePasswordDto {
  @IsNotEmpty()
  currentPassword!: string;

  @IsStrongPassword()
  newPassword!: string;
}
