import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { ProcessingModule } from './processing/processing.module.js';

@Module({
  imports: [DatabaseModule, DocumentsModule, ProcessingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
