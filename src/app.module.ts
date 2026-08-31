import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { DocumentsModule } from './documents/documents.module.js';

@Module({
  imports: [DatabaseModule, DocumentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
