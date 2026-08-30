import { IsNotEmpty, IsUUID } from 'class-validator';

export class SelectMembershipDto {
  @IsNotEmpty()
  selectionToken!: string;

  @IsUUID()
  membershipId!: string;
}
