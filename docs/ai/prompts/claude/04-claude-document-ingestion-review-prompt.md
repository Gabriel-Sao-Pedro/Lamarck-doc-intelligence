# 04 — Review da ingestão de documentos

> Esta versão é o roteiro da revisão humana. Ela deve ser preenchida somente depois de conferir o código, os testes, o relatório `003` e a CI. Não marque PASS nem aprove merge sem evidência.

## 1. Resultado

Defina um dos resultados:

- **APROVADO**
- **REPROVADO ATÉ CORREÇÃO**

Explique em poucas linhas se a ingestão está pronta para merge ou se existe algum bloqueador.

O ponto principal desta revisão é confirmar se `POST /documents` funciona como especificado e se a deduplicação, principalmente em concorrência, não pode deixar banco e storage inconsistentes.

## 2. Estado revisado

Conferir e registrar:

- **Branch:** `feat/document-ingestion`
- **HEAD esperado:** `e42e7ae`
- **Commits da implementação:**
 - `efb1f5b`
 - `baf76c7`
 - `3a0456f`
 - `e42e7ae`
- **CI esperada:** run `33447471864`
- **Working tree:** deve estar sem alteração rastreada

Antes de revisar:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline -12
```

Se o estado for diferente, registrar isso antes de continuar.

## 3. O que eu conferi

Conferir diretamente no código, não só no relatório:

- `POST /documents`;
- multipart;
- limite de 10 MB;
- validação de JPG/JPEG/PNG por conteúdo real;
- SHA-256;
- deduplicação;
- `DocumentStorage`;
- transação `Document + ProcessingJob`;
- compensação quando o banco falha;
- tratamento da corrida de duplicata;
- testes T1–T10;
- alteração da CI para executar E2E;
- `docs/implementation/003-document-ingestion.md`.

Comparar a feature com a base:

```bash
git diff 4465848..e42e7ae --stat
git diff 4465848..e42e7ae
```

Também confirmar que não entrou worker, processamento por IA, retry, `ProcessingRun`, `DocumentResult`, consulta/listagem ou outra etapa posterior.

## 4. Findings confirmados

Registrar apenas problemas realmente encontrados.

O ponto que merece maior atenção é a concorrência de deduplicação.

Revisar este cenário:

```text
request A calcula hash H
request B calcula hash H
A não encontra duplicata
B não encontra duplicata
A salva seu arquivo
B salva seu arquivo
A cria Document + ProcessingJob
B bate na unique constraint
```

Conferir:

- se cada request usa uma `storageKey` própria;
- se a request perdedora apaga somente o arquivo que ela criou;
- se existe algum caminho em que ela possa apagar o arquivo da vencedora;
- se depois da corrida existe exatamente 1 `Document`;
- se existe exatamente 1 `ProcessingJob`;
- se o arquivo apontado pelo registro vencedor continua existindo;
- se a request perdedora retorna o `documentId` real do vencedor.

Se a perdedora puder remover o arquivo vencedor, tratar como **BLOQUEADOR**.

Para cada finding usar:

```text
F-XXX — título

Severidade:
Arquivo/local:
Problema:
Cenário:
Impacto:
Evidência:
Correção sugerida:
Status: CONFIRMADO
```

Se não houver problema:

`Nenhum finding novo confirmado.`

## 5. Decisões técnicas relevantes

Conferir e registrar se as decisões abaixo ficaram corretas:

### Limite

O limite de 10 MB deve estar no parser/interceptor multipart, e não apenas em uma checagem posterior de `buffer.length`.

### Tipo real

JPG/JPEG/PNG devem ser validados por magic bytes. Extensão e MIME enviados pelo cliente não podem ser a única validação.

### SHA-256

O hash deve ser calculado sobre os bytes exatos recebidos.

### Deduplicação

A consulta prévia ajuda, mas a proteção final contra corrida deve continuar sendo a constraint única no PostgreSQL.

### Storage

O banco deve guardar `storageKey`, não blob.

A chave física não deve conter PII nem depender do nome original do arquivo.

### Transação

`Document` e `ProcessingJob` de um documento novo devem ser criados na mesma transação.

### Compensação

Se o arquivo foi salvo e a persistência falhar, a request deve remover somente o arquivo que ela própria criou.

### `.gitignore`

Confirmar que a correção feita para `storage/` permite versionar `src/storage/`, mas continua ignorando o diretório runtime de arquivos.

## 6. Riscos não bloqueantes

Registrar somente riscos que realmente permanecerem.

Exemplos que podem continuar sendo aceitáveis:

- crash do processo entre salvar o arquivo e executar a compensação pode deixar órfão no storage;
- `claimToken` ainda não é usado porque worker/claim não fazem parte desta tarefa;
- `npm audit` continua apontando `deepmerge-ts` via tooling do Prisma;
- validação por magic bytes é intencionalmente simples para a Fase 1.

Não transformar trade-off conhecido em finding sem impacto concreto.

## 7. Validações / CI

Mapear os testes T1–T10:

| Teste | O que precisa provar |
|---|---|
| T1 | upload válido cria `Document + ProcessingJob` |
| T2 | novo documento retorna `202` |
| T3 | SHA-256 persistido é correto |
| T4 | duplicata retorna mesmo `documentId` |
| T5 | duplicata não cria segundo job |
| T6 | >10 MB é rejeitado |
| T7 | conteúdo falso é rejeitado |
| T8 | falha no banco executa compensação |
| T9 | concorrência termina com um documento/job e storage íntegro |
| T10 | banco guarda `storageKey`, não blob |

Executar ou conferir:

```bash
npm ci
npm run prisma:validate
npm run prisma:generate
npm run build
npm run lint
npm test
npm run test:e2e
docker compose config
npm audit
npm audit --omit=dev
```

Registrar:

| Check | Resultado |
|---|---|
| `npm ci` | PASS / FAIL / NÃO EXECUTADO |
| Prisma validate | |
| Prisma generate | |
| Build | |
| Lint | |
| Tests | |
| E2E | |
| Docker Compose | |
| `npm audit` | |
| `npm audit --omit=dev` | |
| CI do HEAD | |

Para a CI, confirmar:

- run `33447471864`;
- HEAD `e42e7ae`;
- PostgreSQL real no service container;
- migrations executadas;
- E2E realmente executado.

## 8. Decisão de merge

Responder:

**PODE FAZER MERGE? SIM / NÃO**

Aprovar somente se:

- contrato do endpoint estiver correto;
- limite de upload estiver correto;
- magic bytes estiverem corretos;
- SHA-256 estiver correto;
- deduplicação sequencial estiver correta;
- corrida não puder apagar o arquivo vencedor;
- banco terminar consistente;
- storage terminar consistente;
- transação estiver correta;
- compensação estiver correta;
- T1–T10 tiverem evidência suficiente;
- CI do HEAD estiver verde;
- não houver feature fora do escopo.

A decisão final de merge é humana.

## 9. Próximo passo

Se aprovado:

```text
feat/document-ingestion
 ↓
merge em main
 ↓
próxima etapa da vertical slice: processamento
```

A próxima etapa deverá implementar o caminho do `ProcessingJob` até o resultado, incluindo claim seguro, `claimToken`, worker, fake provider e persistência do processamento.

Se reprovado:

- corrigir somente os findings confirmados;
- reexecutar os testes afetados;
- rodar CI novamente;
- fazer nova revisão focada na correção.

Não faça merge enquanto houver finding bloqueante.
