# 05 — Corrigir os findings da ingestão

## 1. Ação

Corrija somente os dois pontos encontrados na revisão da ingestão:

- `ING-001`: fortalecer o teste T9 para confirmar que o arquivo físico vencedor continua íntegro depois da corrida de deduplicação;
- `ING-002`: corrigir a contagem de testes E2E no relatório `003`.

Não reabra a feature e não implemente processing.

## 2. Contexto

A ingestão foi aprovada tecnicamente e não tem bloqueador de funcionalidade.

Branch atual:

`feat/document-ingestion`

HEAD revisado:

`e42e7ae8d3e783c1683091988cdb42be4bfd8ac3`

O T9 já confirma que duas requisições concorrentes terminam com apenas um `Document` e um `ProcessingJob`, mas ainda não verifica diretamente o arquivo físico associado ao vencedor.

O relatório também registra `9/9` E2E, enquanto a execução atual mostrou `8/8`.

Antes de alterar:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline -10
```

Existe uma alteração local conhecida em:

`docs/ai/prompts/claude/03-claude-document-ingestion-prompt.md`

Não toque nesse arquivo e não inclua essa alteração nos commits desta correção.

## 3. Papel

Atue como implementador da correção.

Faça apenas os ajustes necessários para fechar os dois findings.

A checagem final e a decisão de merge serão feitas por mim.

## 4. Dados de entrada e referências

Leia:

- `test/documents.e2e-spec.ts`;
- fixtures de teste;
- implementação do storage;
- fluxo de deduplicação;
- `docs/implementation/003-document-ingestion.md`.

No T9, depois da corrida:

1. obtenha o `Document` vencedor;
2. use a `storageKey` persistida;
3. confirme que o arquivo físico existe;
4. leia o arquivo;
5. compare os bytes com a fixture enviada.

O teste deve provar que a compensação da request perdedora não apagou o arquivo vencedor.

Se for seguro dentro do isolamento atual dos testes, confirme também que não ficou uma segunda cópia permanente.

Não altere a lógica de produção só para fazer o teste passar. Se o teste revelar um bug real, pare e me mostre.

No relatório `003`, corrija a contagem E2E para o número realmente executado ao final.

## 5. Formato de saída

Depois da correção, rode:

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

Antes do commit:

```bash
git status --short
git diff --stat
git diff -- test/documents.e2e-spec.ts docs/implementation/003-document-ingestion.md
```

Faça commits pequenos, de preferência:

```text
test: strengthen duplicate race storage assertion
docs: correct ingestion e2e test count
```

Faça stage apenas dos arquivos da correção. Não use `git add .` nem `git add -A`.

Faça push para:

`origin/feat/document-ingestion`

Acompanhe a CI e informe:

- HEAD;
- run id;
- resultado;
- confirmação de que o E2E executou.

Ao final, diga de forma objetiva:

- como ING-001 foi corrigido;
- se o arquivo vencedor existe;
- se os bytes conferem;
- se continua existindo apenas um Document e um ProcessingJob;
- qual contagem E2E ficou registrada;
- arquivos alterados;
- testes;
- CI;
- riscos restantes.

Depois pare para minha checagem.

## 6. Restrições e limites

Não altere:

- código de produção sem necessidade;
- schema;
- migrations;
- specification;
- architecture;
- ADRs;
- reviews anteriores;
- prompt histórico 03;
- `CLAUDE.md`;
- `AGENTS.md`;
- `PROJECT_CONTEXT.md`.

Não implemente:

- worker;
- claim;
- retry;
- processamento por IA;
- `ProcessingRun`;
- `DocumentResult`;
- consulta/listagem;
- autenticação;
- frontend.

Não faça merge.

Não esconda falha de teste ou CI.

Se a correção do teste revelar um problema real na implementação, pare e reporte antes de expandir o escopo.
