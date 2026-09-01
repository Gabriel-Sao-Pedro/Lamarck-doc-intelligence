import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_KEY_SECURITY_SCHEME } from './auth/api-key.constants.js';

/**
 * Registro do documento OpenAPI (Fase 2.4). Extraído de main.ts para que os
 * testes e2e montem o mesmo documento exposto em produção, em vez de
 * duplicar a configuração (title/description/version/security scheme) num
 * segundo lugar que poderia divergir silenciosamente.
 */
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('DOC Intelligence API')
    .setDescription('API de ingestão, processamento assíncrono e consulta de documentos.')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, API_KEY_SECURITY_SCHEME)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
