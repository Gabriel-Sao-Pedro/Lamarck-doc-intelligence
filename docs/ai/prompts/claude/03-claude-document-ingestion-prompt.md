# 03 — Claude — Implementação técnica da ingestão de documentos

## Objetivo da tarefa

Implementar a primeira etapa funcional da vertical slice do backend do DOC Intelligence: receber um documento, validá-lo, calcular SHA-256, persistir o arquivo via storage local, criar `Document + ProcessingJob` e responder `202 Accepted`.

Esta tarefa termina na criação persistida do job. Não implemente worker nem processamento por IA ainda.

A foundation já foi aprovada após a correção do F-001 de lease fencing.

---

## 0. Pré-condições obrigatórias

Antes de escrever qualquer código:

1. Confirme que a foundation já foi incorporada em `main`.
2. Atualize a referência remota sem reescrever histórico.
3. Crie uma branch nova a partir de `main`:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b feat/document-ingestion
```

4. Confirme o estado:

```bash
git status --short
git branch --show-current
git log --oneline -10
```

Esperado:

- branch: `feat/document-ingestion`;
- working tree limpa;
- branch criada diretamente da `main` contendo a foundation aprovada.

Se houver alteração inesperada, divergência de branch ou arquivo rastreado modificado antes desta tarefa, pare e reporte antes de editar.

---

## 1. Leitura obrigatória antes da implementação

Leia integralmente antes de decidir estrutura ou editar código:

- `CLAUDE.md`
- `AGENTS.md`
- `PROJECT_CONTEXT.md`
- `docs/specification.md`
- `docs/architecture.md`
- todos os ADRs existentes
- `docs/implementation/001-project-foundation.md`
- `docs/implementation/002-foundation-lease-fencing-fix.md`
- `docs/implementation/reviews/01-project-foundation-review.md`
- `docs/implementation/reviews/02-foundation-lease-fencing-review.md`
- `prisma/schema.prisma`
- migrations existentes
- módulos NestJS existentes
- testes existentes
- configuração de CI

Não redefina decisões já fechadas sem necessidade concreta.

---

## 2. Resultado funcional obrigatório

Implementar:

```text
POST /documents
Content-Type: multipart/form-data
field: file
```

Fluxo esperado para documento novo:

```text
HTTP request
  -> limite multipart
  -> arquivo recebido
  -> validação do conteúdo real
  -> SHA-256 dos bytes originais
  -> consulta de duplicata
  -> armazenamento local
  -> transação Document + ProcessingJob
  -> 202 Accepted
```

Fluxo esperado para duplicata exata:

```text
HTTP request
  -> validação
  -> SHA-256
  -> hash já existe
  -> não criar Document
  -> não criar ProcessingJob
  -> não manter segunda cópia permanente
  -> retornar o documentId existente + status atual
  -> 202 Accepted
```

---

## 3. Contrato HTTP

### Request

```http
POST /documents
Content-Type: multipart/form-data
```

Campo obrigatório:

```text
file
```

Fase 1 aceita somente:

- JPG
- JPEG
- PNG

Tamanho máximo:

```text
10 MB
```

### Response — novo documento

Formato equivalente a:

```json
{
  "documentId": "uuid",
  "status": "RECEIVED",
  "deduplicated": false
}
```

Status HTTP:

```text
202 Accepted
```

### Response — duplicata

Formato equivalente a:

```json
{
  "documentId": "uuid-existente",
  "status": "STATUS_ATUAL_DO_DOCUMENTO",
  "deduplicated": true
}
```

Status HTTP:

```text
202 Accepted
```

Não invente campos extras sem benefício concreto.

---

## 4. Limite de upload

O limite de 10 MB deve ser imposto no parser/interceptor multipart.

Não implemente uma solução que aceite tamanho arbitrário e só depois verifique `buffer.length`.

O objetivo é impedir buffering arbitrário de arquivos grandes.

Se a stack atual exigir buffering para os arquivos válidos de até 10 MB, isso é aceitável para Fase 1, desde que o limite seja aplicado antes de aceitar tamanho superior ao máximo.

Registre no relatório a estratégia usada.

---

## 5. Validação do tipo real

Não confie somente em:

- extensão;
- `originalname`;
- `Content-Type`;
- MIME informado pelo cliente.

Valide assinatura/magic bytes do arquivo.

Fase 1:

### JPEG

Reconhecer assinatura compatível com JPEG.

### PNG

Reconhecer assinatura compatível com PNG.

Se extensão/MIME disser imagem aceita mas os bytes não forem compatíveis:

- rejeitar;
- não salvar permanentemente;
- não criar `Document`;
- não criar `ProcessingJob`.

Não implemente parsing completo da imagem se magic bytes forem suficientes para a decisão desta fase.

---

## 6. SHA-256 e deduplicação

Calcule:

```text
SHA-256(bytes exatos recebidos)
```

A deduplicação desta fase é somente duplicata exata.

Não implemente:

- perceptual hash;
- OCR;
- comparação visual;
- similaridade semântica;
- deduplicação por nome.

O hash deve ser persistido em campo com constraint única ou equivalente já definida no schema.

A constraint do banco é a barreira final contra corrida.

---

## 7. Concorrência de duplicata

Trate explicitamente o cenário:

```text
request A calcula hash H
request B calcula hash H
A consulta: não existe
B consulta: não existe
A salva/cria
B tenta salvar/criar
```

Resultado obrigatório:

- apenas um `Document`;
- apenas um `ProcessingJob`;
- nenhuma segunda cópia permanente;
- as duas requisições retornam `202`;
- a requisição perdedora retorna o `documentId` real já criado;
- nunca apagar o arquivo pertencente à requisição vencedora.

Não dependa apenas da consulta prévia de existência.

Use a constraint única do banco como proteção final e trate o conflito de forma intencional.

---

## 8. DocumentStorage

Crie ou complete uma abstração:

```text
DocumentStorage
```

Ela deve esconder o mecanismo físico de armazenamento.

Operações mínimas, com nomes adequados à arquitetura do projeto:

```text
save(...)
delete(...)
```

Implementação Fase 1:

```text
LocalDocumentStorage
```

Regras:

- arquivo fora do banco;
- banco guarda `storageKey`;
- não persistir blob;
- não usar caminho absoluto como contrato de domínio;
- storage deve ser substituível futuramente;
- diretório local não deve expor dados pessoais no nome;
- não use o nome original como chave física final.

A chave pode usar UUID/hash ou outro identificador não sensível.

Não implemente S3, MinIO ou cloud nesta tarefa.

---

## 9. Ordem de persistência e compensação

Para documento novo:

```text
1. receber
2. validar
3. calcular hash
4. consultar duplicata
5. salvar arquivo via DocumentStorage
6. abrir transação
7. criar Document
8. criar ProcessingJob
9. commit
10. responder 202
```

Se a persistência falhar depois de o arquivo ter sido salvo:

```text
delete somente o arquivo salvo por esta requisição
```

Não deixe arquivo órfão quando a falha for conhecida e síncrona neste fluxo.

A possibilidade de crash do processo entre storage e compensação pode permanecer como limitação conhecida da Fase 1; registre, não tente resolver com infraestrutura nova.

---

## 10. Transação

`Document` e `ProcessingJob` de um documento novo devem ser criados na mesma transação Prisma.

Não aceite estado persistido em que exista:

```text
Document novo sem ProcessingJob
```

por causa de falha entre duas operações normais do request.

O `ProcessingJob` deve usar os defaults/estado operacional definidos pela foundation.

Não altere retry, claim, lease ou fencing nesta tarefa.

---

## 11. Estado inicial

O documento novo deve começar no estado definido pela arquitetura:

```text
RECEIVED
```

O job deve ficar disponível para o worker futuro conforme o schema atual.

Não implemente transições além da criação inicial.

Não crie uma segunda state machine.

---

## 12. Erros HTTP

Trate pelo menos:

### Arquivo ausente
Retorne erro 4xx adequado.

### Arquivo maior que 10 MB
Retorne 4xx adequado.

### Formato não aceito
Retorne 4xx adequado.

### Conteúdo real inválido/incompatível
Retorne 4xx adequado.

### Falha de storage
Retorne erro coerente sem expor detalhes internos.

### Falha de banco
Retorne erro coerente e execute compensação quando aplicável.

Não retorne:

- stack trace;
- caminhos absolutos;
- connection strings;
- SQL interno;
- detalhes de filesystem;
- dados pessoais em logs.

---

## 13. Logs

Logs devem ser úteis operacionalmente sem registrar conteúdo sensível.

Pode registrar, quando necessário:

- `documentId`;
- status;
- hash de forma apropriada;
- código/causa técnica genérica;
- duração.

Evite:

- nome completo extraído;
- número de documento;
- conteúdo do arquivo;
- bytes;
- dados pessoais;
- nome original se não houver necessidade operacional clara.

---

## 14. Organização de código

Respeite modularidade do NestJS.

A feature deve ter fronteiras claras entre:

- transporte HTTP;
- caso de uso/serviço de aplicação;
- storage;
- Prisma/persistência;
- validação de arquivo.

Não coloque toda a lógica no controller.

Evite abstrações artificiais.

Não crie repository genérico se não houver problema real que ele resolva.

Prefira nomes específicos do domínio.

---

## 15. Schema e migrations

Primeiro tente implementar com o schema aprovado.

Se o schema não possuir algum campo indispensável para a ingestão:

1. pare;
2. explique exatamente o campo que falta;
3. explique por que a ingestão não pode ser implementada corretamente sem ele;
4. só então proponha migration incremental.

Não altere migrations anteriores.

Nunca edite:

- migration inicial;
- migration do `claimToken`.

Não faça squash.

---

## 16. Testes obrigatórios

Adicione testes que provem comportamento, não somente linhas executadas.

Cobrir no mínimo:

### T1 — upload válido
Um JPG/PNG fictício válido cria `Document + ProcessingJob`.

### T2 — status HTTP
Documento novo retorna `202`.

### T3 — SHA-256
O hash persistido corresponde exatamente aos bytes enviados.

### T4 — duplicata
Segundo upload com os mesmos bytes retorna o mesmo `documentId`.

### T5 — job único
Duplicata não cria segundo `ProcessingJob`.

### T6 — limite
Arquivo maior que 10 MB é rejeitado antes de persistência.

### T7 — tipo real
Arquivo com extensão/MIME aceitos e conteúdo incompatível é rejeitado.

### T8 — compensação
Se o banco falhar depois de salvar o arquivo, o arquivo desta requisição é removido.

### T9 — concorrência
Duas tentativas concorrentes com o mesmo hash resultam em somente um documento/job e ambas resolvem para o documento vencedor.

### T10 — storage
Banco persiste `storageKey`, não conteúdo/binário.

Use arquivos fictícios mínimos criados para teste.

Não use documento real.

Se T9 exigir teste de integração específico com PostgreSQL real, prefira isso a um mock incapaz de reproduzir constraint/concorrência.

---

## 17. Validação manual da API

Depois dos testes automatizados, faça uma verificação manual mínima do endpoint rodando localmente.

Demonstrar pelo menos:

1. upload válido;
2. duplicata;
3. formato inválido.

Use arquivo fictício.

Registre comandos e respostas úteis no relatório, sem dados sensíveis.

---

## 18. Validações de projeto

Execute:

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

Se houver migration nova aprovada por necessidade real, valide também banco limpo desde a primeira migration.

Preserve resultados reais.

Se um teste falhar e depois passar, registre.

O problema conhecido de `deepmerge-ts` via tooling do Prisma deve continuar sendo tratado como risco conhecido, não escondido.

Não execute:

```bash
npm audit fix --force
```

Não faça upgrade de Prisma apenas para silenciar audit.

---

## 19. Critérios de aceite

A tarefa só pode ser considerada concluída se:

- `POST /documents` existir;
- aceitar JPG/JPEG/PNG válidos;
- rejeitar >10 MB;
- validar magic bytes;
- calcular SHA-256;
- deduplicar bytes idênticos;
- retornar `202` para novo;
- retornar `202` para duplicata;
- duplicata reutilizar `documentId`;
- não criar segundo job;
- storage estiver abstraído;
- arquivo não estiver salvo como blob;
- `Document + ProcessingJob` forem transacionais;
- compensação de falha conhecida estiver implementada;
- corrida de hash estiver protegida pela constraint do banco;
- testes relevantes passarem;
- build/lint/E2E passarem;
- relatório refletir exatamente a implementação.

---

## 20. Fora de escopo

NÃO implementar nesta tarefa:

- worker;
- claim de job;
- `FOR UPDATE SKIP LOCKED`;
- `claimToken` em uso;
- lease recovery;
- retry;
- processamento por IA;
- fake provider;
- `ProcessingRun`;
- `DocumentResult`;
- classificação de documento;
- extração;
- confiança;
- nome padronizado;
- consulta de resultado;
- listagem;
- fila de revisão;
- correção humana;
- PDF;
- autenticação;
- frontend;
- deploy;
- object storage remoto.

Não “adiantar” a próxima tarefa.

---

## 21. Relatório

Somente depois da implementação e das validações, crie:

```text
docs/implementation/003-document-ingestion.md
```

Em português, com linguagem simples e técnica.

Conteúdo mínimo:

1. objetivo;
2. fluxo implementado;
3. contrato do endpoint;
4. limite de upload;
5. validação de tipo real;
6. SHA-256;
7. deduplicação;
8. tratamento da corrida;
9. storage local;
10. transação `Document + ProcessingJob`;
11. compensação;
12. testes;
13. validação manual;
14. CI;
15. audit;
16. riscos e limitações;
17. o que ficou fora;
18. assistência do Claude nesta implementação.

Não diga que fez revisão humana.

Não invente resultados.

---

## 22. Inspeção antes do commit

Antes de qualquer commit:

```bash
git status --short
git diff --stat
git diff
```

Confirme explicitamente:

- nenhuma migration anterior foi editada;
- specification não foi reescrita;
- architecture não foi reescrita;
- ADRs anteriores não foram reescritos;
- reviews anteriores não foram alteradas;
- nenhuma etapa de processing/worker entrou;
- nenhum dado real foi adicionado;
- nenhum secret foi adicionado.

---

## 23. Commits

Separe implementação e documentação quando fizer sentido.

Sugestão:

```text
feat: add document ingestion flow
docs: record document ingestion implementation
```

Não force a separação se o diff real justificar estrutura melhor, mas mantenha histórico legível.

---

## 24. Push e CI

Faça push para:

```text
origin/feat/document-ingestion
```

Não faça merge.

Depois identifique a GitHub Actions run correspondente ao HEAD enviado.

Registre:

- HEAD;
- run id;
- status final;
- etapa que falhou, se houver.

Se CI falhar por causa desta tarefa:

- preserve a evidência;
- diagnostique;
- corrija somente dentro do escopo;
- novo commit;
- push;
- nova CI.

---

## 25. Resposta final obrigatória

Responda ao final com:

### Estado
- branch
- HEAD
- working tree

### Implementação
- endpoint
- validação
- hash
- deduplicação
- storage
- transação
- compensação

### Concorrência
- mecanismo usado para corrida de duplicata
- comportamento da requisição perdedora

### Schema
- migration nova: SIM/NÃO
- se SIM, motivo
- migrations anteriores preservadas: SIM/NÃO

### Testes

| Caso | Resultado |
|---|---|
| upload válido | |
| 202 novo | |
| SHA-256 | |
| duplicata | |
| job único | |
| >10 MB | |
| magic bytes inválidos | |
| compensação | |
| concorrência | |
| storageKey sem blob | |

### Validações

| Check | Resultado |
|---|---|
| npm ci | |
| Prisma validate | |
| Prisma generate | |
| Build | |
| Lint | |
| Tests | |
| E2E | |
| Docker Compose | |
| npm audit | |
| npm audit --omit=dev | |
| CI do HEAD | |

### Arquivos principais alterados
Liste somente os relevantes.

### Riscos / limitações
Liste fatos reais.

### Git
```bash
git status --short
git log --oneline -10
```

### Próximo passo
Aguardar revisão humana da ingestão.

Não faça a revisão.
Não faça merge.
Pare depois disso.
