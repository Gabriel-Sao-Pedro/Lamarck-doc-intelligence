import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentListService } from './document-list.service.js';
import { DocumentQueryService } from './document-query.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentQueryService, DocumentListService, ApiKeyGuard],
})
export class DocumentsModule {}
