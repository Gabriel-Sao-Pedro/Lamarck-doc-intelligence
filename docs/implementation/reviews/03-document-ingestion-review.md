# Review — ingestão de documentos

## 1. Resultado

**APROVADO**

Revisei a implementação da ingestão de documentos e considero a feature pronta para merge.

A implementação principal foi feita pelo Claude. Na minha revisão, encontrei dois pontos pequenos que não bloqueavam a funcionalidade, mas que eu preferi corrigir antes do merge para deixar a etapa mais bem fechada e com evidência melhor:

- `ING-001` — o teste de concorrência ainda não comprovava a integridade física do arquivo vencedor no storage;
- `ING-002` — o relatório `003` registrava uma contagem E2E diferente da execução real.

Eu mesmo corrigi esses dois pontos. Depois das correções, fiz uma checagem focada neles e não encontrei nenhum finding novo.

## 2. Estado revisado

- **Branch:** `feat/document-ingestion`
- **Base da feature:** `4465848`
- **HEAD final revisado:** `38062858e59f2c7386b33713d952825fcca8e19d`
- **Commits principais da implementação:**
  - `efb1f5b` — implementação da ingestão;
  - `baf76c7` — relatório da implementação;
  - `3a0456f` — inclusão do E2E na CI;
  - `e42e7ae` — ajuste do relatório.
- **Commits das minhas correções após a revisão:**
  - `f32f82f` — fortalecimento do teste de concorrência;
  - `3806285` — correção da contagem E2E no relatório.
- **CI final:** run `33449569118` — `SUCCESS`.

A run final corresponde ao HEAD `38062858e59f2c7386b33713d952825fcca8e19d` e executou o E2E com sucesso.

## 3. O que eu conferi

Conferi a implementação da ingestão diretamente no código, nos testes, no relatório e na CI.

Os principais pontos revisados foram:

- `POST /documents`;
- multipart com campo `file`;
- retorno `202` para documento novo e para duplicata;
- limite de 10 MB aplicado no parser;
- validação de JPEG e PNG por magic bytes;
- SHA-256 calculado sobre os bytes recebidos;
- deduplicação sequencial;
- deduplicação concorrente;
- `DocumentStorage` local;
- persistência por `storageKey`, sem blob no banco;
- criação de `Document + ProcessingJob` na mesma transação;
- compensação quando o arquivo é salvo e a persistência falha;
- testes T1–T10;
- execução dos E2E contra PostgreSQL real;
- alteração da CI para executar E2E;
- coerência do `docs/implementation/003-document-ingestion.md`;
- preservação de schema, migrations e escopo da foundation.

Também confirmei que não entrou nesta etapa:

- worker;
- claim;
- uso do `claimToken`;
- retry;
- processamento por IA;
- `ProcessingRun`;
- `DocumentResult`;
- consulta/listagem;
- fila de revisão;
- PDF;
- autenticação;
- frontend.

## 4. Findings confirmados

Na primeira revisão da ingestão, confirmei dois findings de severidade baixa.

### ING-001 — T9 não validava a integridade física do arquivo vencedor

**Severidade:** BAIXA  
**Status inicial:** CONFIRMADO  
**Status final:** CORRIGIDO E VALIDADO  
**Correção feita por mim no commit:** `f32f82f`

O teste de concorrência já comprovava que duas requisições simultâneas com o mesmo arquivo terminavam com:

- 1 `Document`;
- 1 `ProcessingJob`;
- mesmo `documentId` para as duas requisições.

O ponto que faltava era comprovar que a compensação da requisição perdedora não apagava o arquivo físico da vencedora nem deixava uma segunda cópia órfã.

Eu fortaleci o T9 para validar isso diretamente.

A checagem final passou a confirmar:

- o `Document` vencedor possui uma `storageKey`;
- o arquivo dessa `storageKey` existe no storage;
- o conteúdo do arquivo é lido com `readFile`;
- os bytes do arquivo são comparados com a fixture usando `Buffer.equals`;
- o diretório é fotografado antes e depois da corrida;
- depois das duas requisições terminarem, existe apenas uma nova entrada;
- essa única entrada nova corresponde à `storageKey` do vencedor.

Isso comprova, no isolamento atual da suíte, o cenário esperado:

```text
request A salva key A
request B salva key B
A vence a criação no banco
B recebe conflito de unicidade
B remove somente key B
o registro vencedor continua apontando para key A
key A continua existindo
bytes de key A são os bytes enviados
```

Nenhuma alteração de código de produção foi necessária para corrigir esse finding.

### ING-002 — contagem de testes E2E divergente no relatório

**Severidade:** BAIXA  
**Status inicial:** CONFIRMADO  
**Status final:** CORRIGIDO E VALIDADO  
**Correção feita por mim no commit:** `3806285`

O relatório `003` registrava `9/9` testes E2E, mas a execução real mostrava `8/8`.

Eu corrigi o relatório para registrar a contagem real:

`8/8`

A checagem final confirmou novamente `8/8`, então relatório e execução agora estão coerentes.

### Findings novos

Nenhum finding novo foi confirmado depois das correções.

## 5. Decisões técnicas relevantes

A implementação principal da ingestão foi mantida sem alteração de código de produção durante minhas correções.

As decisões que considerei corretas e mantive foram:

### Limite de upload

O limite de 10 MB está configurado no `FileInterceptor`, então a aplicação não depende apenas de uma checagem posterior de `buffer.length`.

### Validação de tipo

JPEG e PNG são validados pelo conteúdo real do arquivo por magic bytes.

A decisão não depende apenas da extensão ou do MIME enviado pelo cliente.

### SHA-256

O hash é calculado diretamente sobre `file.buffer`, representando os bytes exatos recebidos.

### Deduplicação

A consulta prévia por SHA-256 evita trabalho desnecessário na maioria dos casos.

A proteção final contra duas requisições concorrentes continua sendo a constraint única de `Document.sha256` no PostgreSQL.

Quando a requisição perdedora encontra o conflito `P2002`, ela resolve para o documento já criado pelo vencedor.

### Storage

Cada requisição usa uma `storageKey` própria baseada em UUID.

Isso é importante porque a compensação da requisição perdedora precisa remover somente o arquivo que aquela própria requisição criou.

O banco armazena apenas `storageKey`, não o conteúdo binário.

### Transação

`Document` e `ProcessingJob` são criados na mesma transação Prisma.

Isso evita o estado normal de falha em que um documento novo é persistido sem o job correspondente.

### Compensação

Se o arquivo foi salvo e a persistência falha, a aplicação tenta remover o arquivo criado por aquela requisição.

O teste T9 reforçado passou a comprovar que essa estratégia não remove o arquivo vencedor no cenário concorrente revisado.

## 6. Riscos não bloqueantes

Alguns riscos continuam conhecidos e aceitos para esta fase:

- um crash do processo entre a gravação no storage e a compensação ainda pode deixar arquivo órfão;
- o teste T9 usa comparação do conteúdo do diretório antes e depois da corrida e pressupõe que nenhum outro E2E escreva no mesmo diretório em paralelo; isso é verdadeiro na suíte atual;
- `claimToken` continua sem uso porque claim e worker pertencem à próxima etapa;
- `npm audit` continua reportando `deepmerge-ts` pelo tooling do Prisma;
- a validação por magic bytes é propositalmente simples nesta fase e não tenta fazer parsing completo da imagem.

Nenhum desses pontos bloqueia a ingestão.

## 7. Validações / CI

Na implementação e na revisão, foram confirmadas as seguintes validações:

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Build | PASS |
| Lint | PASS |
| Tests | PASS |
| E2E | PASS — 8/8 |
| Docker Compose | PASS |
| `npm audit` | FAIL — risco conhecido em `deepmerge-ts` |
| `npm audit --omit=dev` | FAIL — mesmo risco conhecido |
| CI final do HEAD | PASS |

Na checagem final dos dois findings:

- E2E: PASS — 8/8;
- Lint: PASS;
- CI: PASS;
- HEAD confirmado: `38062858e59f2c7386b33713d952825fcca8e19d`;
- run confirmada: `33449569118`.

O E2E roda contra PostgreSQL real em service container.

## 8. Decisão de merge

**PODE FAZER MERGE.**

A implementação principal feita pelo Claude foi revisada.

Os dois findings que encontrei foram corrigidos por mim e depois validados novamente:

- `ING-001` — corrigido e validado;
- `ING-002` — corrigido e validado.

Não encontrei novo finding confirmado.

Também não houve, durante minhas correções:

- alteração de código de produção;
- mudança de schema;
- nova migration;
- implementação de processing;
- expansão indevida de escopo.

A ingestão está aprovada para ser incorporada em `main`.

## 9. Próximo passo

O próximo passo é fechar a rastreabilidade desta etapa, fazer o merge de `feat/document-ingestion` em `main` e confirmar a CI da `main`.

Depois disso começa a próxima etapa da vertical slice:

```text
ProcessingJob
        ↓
claim seguro
        ↓
claimToken
        ↓
lease
        ↓
worker
        ↓
provider fake
        ↓
retry
        ↓
ProcessingRun
        ↓
DocumentResult
        ↓
COMPLETED / NEEDS_REVIEW / FAILED
```

A ingestão fica encerrada após o merge e a próxima revisão passa a tratar somente o processamento.
