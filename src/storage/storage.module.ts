import { Module } from '@nestjs/common';
import { DocumentStorage } from './document-storage.js';
import { LocalDocumentStorage } from './local-document-storage.js';

@Module({
  providers: [{ provide: DocumentStorage, useClass: LocalDocumentStorage }],
  exports: [DocumentStorage],
})
export class StorageModule {}
