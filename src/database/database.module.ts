import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Global module exposing a single PrismaService instance to the rest of
 * the application. No domain repositories live here yet — this is
 * foundation-stage wiring only.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
