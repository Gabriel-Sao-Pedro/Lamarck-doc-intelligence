/**
 * Fonte única da API key configurada (Fase 2.3,
 * docs/ai/prompts/claude/10-claude-phase2-api-key-prompt.md). Lida sob
 * demanda em vez de constante de módulo — permite o bootstrap falhar
 * explicitamente antes de subir a aplicação (main.ts) sem obrigar toda
 * configuração de teste a definir API_KEY antes do primeiro import do
 * módulo de auth.
 */
export function getConfiguredApiKey(): string {
  const value = process.env.API_KEY;
  if (!value || value.trim().length === 0) {
    throw new Error('API_KEY não está configurada. Defina a variável de ambiente antes de iniciar a aplicação.');
  }
  return value;
}
