import { Module } from '@nestjs/common';
import { EncryptionService } from './crypto/encryption.service';
import { HashService } from './crypto/hash.service';

@Module({
  providers: [HashService, EncryptionService],
  exports: [HashService, EncryptionService],
})
export class CommonModule {}
