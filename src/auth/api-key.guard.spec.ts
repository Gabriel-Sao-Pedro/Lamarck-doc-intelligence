import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';

function makeContext(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const originalApiKey = process.env.API_KEY;

  afterEach(() => {
    process.env.API_KEY = originalApiKey;
  });

  it('rejeita quando o header X-API-Key está ausente', () => {
    process.env.API_KEY = 'correct-key';
    const guard = new ApiKeyGuard();
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('rejeita quando o header X-API-Key está vazio', () => {
    process.env.API_KEY = 'correct-key';
    const guard = new ApiKeyGuard();
    expect(() => guard.canActivate(makeContext({ 'x-api-key': '' }))).toThrow(UnauthorizedException);
  });

  it('rejeita quando a chave está errada', () => {
    process.env.API_KEY = 'correct-key';
    const guard = new ApiKeyGuard();
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong-key' }))).toThrow(UnauthorizedException);
  });

  it('rejeita quando a chave errada tem comprimento diferente da configurada', () => {
    process.env.API_KEY = 'correct-key';
    const guard = new ApiKeyGuard();
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'short' }))).toThrow(UnauthorizedException);
  });

  it('aceita quando a chave está correta', () => {
    process.env.API_KEY = 'correct-key';
    const guard = new ApiKeyGuard();
    expect(guard.canActivate(makeContext({ 'x-api-key': 'correct-key' }))).toBe(true);
  });

  it('lança erro (não 401 silencioso) quando API_KEY não está configurada', () => {
    delete process.env.API_KEY;
    const guard = new ApiKeyGuard();
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'qualquer-coisa' }))).toThrow(
      /API_KEY não está configurada/,
    );
  });
});
