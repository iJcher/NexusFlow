import { Global, Module } from '@nestjs/common';
import { SecretVault } from './secret-vault';
@Global()
@Module({ providers: [SecretVault], exports: [SecretVault] })
export class SecurityModule {}
