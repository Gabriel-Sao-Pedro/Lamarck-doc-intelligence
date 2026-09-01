import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getConfiguredApiKey } from './auth/api-key.config.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Falha cedo se API_KEY não estiver configurada (Fase 2.3) — não aceitar
  // silenciosamente qualquer request depois de a aplicação já estar no ar.
  getConfiguredApiKey();

  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
