import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    // Os specs e2e compartilham o mesmo PostgreSQL real. Rodar os arquivos
    // em série (em vez de workers paralelos) evita que jobs elegíveis
    // criados por um spec (ex.: ingestão) sejam disputados/consumidos por
    // outro spec (ex.: processamento) rodando ao mesmo tempo.
    fileParallelism: false,
  },
});
