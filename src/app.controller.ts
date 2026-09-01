import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Smoke/health, não faz parte do contrato de negócio documentado no
  // OpenAPI (Fase 2.4 — docs/implementation/011-phase2-openapi.md §6).
  @Get()
  @ApiExcludeEndpoint()
  getHello(): string {
    return this.appService.getHello();
  }
}
