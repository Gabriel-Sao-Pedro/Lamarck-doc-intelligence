import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Módulo global que expõe uma única instância do PrismaService para o
 * resto da aplicação. Nenhum repositório de domínio vive aqui ainda — é
 * só a conexão da fase de foundation.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
