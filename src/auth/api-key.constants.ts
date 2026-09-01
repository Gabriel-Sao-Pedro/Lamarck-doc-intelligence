/**
 * Nome estável do security scheme de API key no documento OpenAPI (Fase
 * 2.4). Compartilhado entre `main.ts` (registro do scheme) e o controller
 * de documents (`@ApiSecurity`), para as duas pontas nunca divergirem.
 */
export const API_KEY_SECURITY_SCHEME = 'api-key';
