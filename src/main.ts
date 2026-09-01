import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getConfiguredApiKey } from './auth/api-key.config.js';
import { setupOpenApi } from './openapi.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Falha cedo se API_KEY não estiver configurada (Fase 2.3) — não aceitar
  // silenciosamente qualquer request depois de a aplicação já estar no ar.
  getConfiguredApiKey();

  const app = await NestFactory.create(AppModule);

  // Documentação OpenAPI (Fase 2.4) — descreve o contrato HTTP já existente,
  // não altera nenhum guard/pipe/interceptor das rotas reais. /docs e
  // /docs-json ficam públicos: não expõem dados processados nem executam
  // operação de negócio, e o "Try it out" continua exigindo X-API-Key real.
  setupOpenApi(app);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
