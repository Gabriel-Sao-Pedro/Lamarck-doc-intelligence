# Relatório de Implementação — Ingestão de documentos

## 1. Objetivo

Implementar o primeiro endpoint funcional de produto: `POST /documents`,
que recebe um arquivo de imagem (JPEG ou PNG), valida seu conteúdo real,
calcula seu SHA-256, deduplica contra documentos já existentes e, para um
documento novo, persiste `Document` + `ProcessingJob` numa única transação.
Escopo definido em
`docs/ai/prompts/claude/03-claude-document-ingestion-prompt.md`.

## 2. Fluxo implementado

```
POST /documents (multipart, campo "file")
  -> Multer/FileInterceptor aplica o limite de 10 MB durante o parsing
  -> detectImageSignature() confere os magic bytes do buffer recebido
     -> se não for JPEG nem PNG real: 400, nada é persistido
  -> sha256 = SHA-256(bytes recebidos)
  -> busca Document existente por sha256
     -> se existir: responde 202 com deduplicated=true, nada novo é criado
  -> DocumentStorage.buildKey() + DocumentStorage.save() grava o arquivo
  -> prisma.$transaction cria Document + ProcessingJob juntos
     -> se a transação falhar por unique constraint (corrida perdida):
        compensa o storage e responde 202 com o documento vencedor
     -> se falhar por outro motivo: compensa o storage e responde 500
  -> responde 202 com deduplicated=false
```

## 3. Contrato do endpoint

`POST /documents`, corpo `multipart/form-data`, campo obrigatório `file`.

Resposta para documento novo — `202 Accepted`:
```json
{ "documentId": "uuid", "status": "RECEIVED", "deduplicated": false }
```

Resposta para duplicata — `202 Accepted`:
```json
{ "documentId": "uuid-do-documento-existente", "status": "...", "deduplicated": true }
```

Erros: `400` (campo ausente, conteúdo real inválido), `413` (arquivo maior
que 10 MB), `500` (falha de storage ou de banco não relacionada a
constraint). Nenhuma dessas respostas expõe stack trace, caminho de
arquivo, string de conexão ou SQL — ver `src/documents/multer-exceptions.filter.ts`
e o bloco `catch` de `DocumentsService.ingest`.

## 4. Limite de upload

Imposto por `FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } })`
(`src/documents/documents.constants.ts`, `MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024`).
O limite é aplicado pelo Multer/Busboy durante o próprio parsing do stream
multipart — a requisição é interrompida antes de o buffer completo ser
formado, não depois. Sem `MulterExceptionsFilter`, o `MulterError` lançado
nesse ponto viraria um `500` genérico; o filtro o converte em `413` com uma
mensagem sem detalhes internos.

## 5. Validação de tipo real

`src/documents/file-signature.ts` (`detectImageSignature`) confere os
primeiros bytes do buffer contra as assinaturas conhecidas:

- JPEG: `FF D8 FF`
- PNG: `89 50 4E 47 0D 0A 1A 0A`

Extensão do arquivo e `Content-Type` declarado pelo cliente **não são
usados** para decidir o tipo — só o conteúdo real. Um arquivo de texto
renomeado para `.jpg` com `Content-Type: image/jpeg` é rejeitado (T7).

## 6. SHA-256

Calculado sobre o buffer completo recebido (`createHash('sha256').update(file.buffer).digest('hex')`),
antes de qualquer gravação em storage ou banco. É o valor único (`Document.sha256 @unique`)
usado tanto para a busca de duplicata quanto para a barreira final de
constraint no banco.

## 7. Deduplicação

Duas camadas, na ordem certa para minimizar trabalho desperdiçado:

1. **Consulta otimista**: `prisma.document.findUnique({ where: { sha256 } })`
   antes de gravar qualquer coisa. Se encontrar, retorna imediatamente sem
   tocar storage ou criar transação.
2. **Barreira de banco**: a constraint `@unique` em `Document.sha256` é a
   garantia real contra a corrida entre a consulta otimista e a criação
   (ver seção 8). A consulta otimista é uma otimização; quem garante
   corretude é a constraint.

## 8. Tratamento da corrida (T9)

Duas requisições com os mesmos bytes podem passar pela consulta otimista
ao mesmo tempo (nenhuma encontra duplicata ainda) e tentar criar o
`Document` em paralelo. A segunda a chegar ao banco recebe um erro de
constraint (`P2002`) na transação. `DocumentsService.isUniqueConstraintViolation`
identifica esse código especificamente; nesse caso, a requisição perdedora:

1. compensa (remove) o arquivo que ela mesma já havia salvo em storage;
2. busca o documento vencedor por `sha256`;
3. responde `202` com `deduplicated: true` e o `documentId` do vencedor.

Não é tratado como falha — é o caminho esperado da requisição que perdeu a
corrida. Coberto por T9, com um teste de integração real contra PostgreSQL
(duas requisições HTTP concorrentes via `Promise.all`), não por mock — um
mock não reproduziria a constraint do banco.

## 9. Storage local

`DocumentStorage` (`src/storage/document-storage.ts`) é uma classe
abstrata com três operações: `buildKey`, `save`, `delete`. A implementação
usada nesta fase, `LocalDocumentStorage`
(`src/storage/local-document-storage.ts`), grava no diretório apontado por
`STORAGE_LOCAL_DIR` (`.env`), com uma chave `UUID.extensão` gerada a partir
da extensão detectada pela assinatura real do arquivo — nunca a partir do
nome ou extensão enviados pelo cliente. `StorageModule` liga a abstração à
implementação local via injeção de dependência (`{ provide: DocumentStorage, useClass: LocalDocumentStorage }`),
para permitir trocar a implementação (ex.: object storage remoto) sem tocar
`DocumentsService`.

## 10. Transação `Document` + `ProcessingJob`

`prisma.$transaction` cria as duas linhas juntas: se `ProcessingJob.create`
falhar depois de `Document.create` ter sido preparado dentro da mesma
transação, o banco desfaz os dois — nunca existe um `Document` sem
`ProcessingJob` (ou vice-versa) para um documento novo.

## 11. Compensação

Se a transação falhar depois de o arquivo já ter sido salvo em storage
(`saveOrThrow` já concluído), `compensateStorage` remove o arquivo dessa
requisição antes de propagar o erro — tanto no caso de corrida perdida
(seção 8) quanto no caso de falha genuína de banco. A falha da própria
compensação (ex.: arquivo já removido, permissão) não mascara o erro
original: é só registrada como aviso (`logger.warn`), porque o problema
original é mais importante de reportar do que a limpeza secundária. Testado
isoladamente em `src/documents/documents.service.spec.ts` (T8), com
`PrismaService` e `DocumentStorage` substituídos por dublês simples — um
teste de unidade é adequado aqui porque o cenário (transação falha depois
do storage já ter sido gravado) é determinístico e não depende de
comportamento real do banco.

## 12. Testes

10 casos exigidos pelo prompt (T1–T10), divididos por tipo:

| Teste | Cobre | Tipo | Arquivo |
|---|---|---|---|
| T1 | Upload válido cria `Document` + `ProcessingJob` | Integração (Postgres real) | `test/documents.e2e-spec.ts` |
| T2 | Documento novo retorna `202` | Integração | `test/documents.e2e-spec.ts` |
| T3 | SHA-256 persistido bate com os bytes enviados | Integração | `test/documents.e2e-spec.ts` |
| T4 | Segundo upload com os mesmos bytes retorna o mesmo `documentId` | Integração | `test/documents.e2e-spec.ts` |
| T5 | Duplicata não cria segundo `ProcessingJob` | Integração | `test/documents.e2e-spec.ts` |
| T6 | Arquivo > 10 MB rejeitado antes de persistência | Integração | `test/documents.e2e-spec.ts` |
| T7 | Conteúdo incompatível com extensão/MIME é rejeitado | Integração | `test/documents.e2e-spec.ts` |
| T8 | Compensação do storage quando o banco falha | Unidade (dublês) | `src/documents/documents.service.spec.ts` |
| T9 | Duas requisições concorrentes resolvem para um único documento/job | Integração (concorrência real) | `test/documents.e2e-spec.ts` |
| T10 | Banco persiste `storageKey`, não o binário | Integração | `test/documents.e2e-spec.ts` |

Arquivos fictícios (nenhum documento real): `test/support/image-fixtures.ts`
gera em memória um PNG 1×1 estruturalmente válido (assinatura + `IHDR` +
`IDAT` deflated + `IEND`, com CRC32 calculado), um JPEG mínimo com
assinatura/trailer corretos, uma versão do JPEG maior que 10 MB, e um
conteúdo de texto puro para simular extensão divertente do conteúdo real.

`test:e2e` usa a instância real de `AppModule` (mesmo padrão do
`test/app.e2e-spec.ts` já existente), contra o PostgreSQL do
`docker-compose.yml`. Cada teste usa bytes distintos para não colidir por
deduplicação entre casos, e a suíte limpa (`afterAll`) as linhas e os
arquivos de storage que ela mesma criou.

Resultado: `npm test` → 2/2 arquivos, 2/2 testes PASS. `npm run test:e2e` →
2/2 arquivos, 8/8 testes PASS (7 desta tarefa + 1 já existente da
foundation).

## 13. Validação manual

Executada depois dos testes automatizados, com a aplicação compilada
rodando localmente (`node dist/main.js`) contra o PostgreSQL do
`docker-compose.yml`, usando os mesmos tipos de arquivo fictício dos
testes automatizados (não documento real):

```bash
curl -sS -w "\nHTTP %{http_code}\n" -F "file=@valid.png;type=image/png" http://localhost:3000/documents
# {"documentId":"5a086cae-...","status":"RECEIVED","deduplicated":false}
# HTTP 202

curl -sS -w "\nHTTP %{http_code}\n" -F "file=@valid.png;type=image/png" http://localhost:3000/documents
# {"documentId":"5a086cae-...","status":"RECEIVED","deduplicated":true}
# HTTP 202

curl -sS -w "\nHTTP %{http_code}\n" -F "file=@fake.jpg;type=image/jpeg" http://localhost:3000/documents
# {"message":"O conteúdo do arquivo não corresponde a um JPEG ou PNG válido.","error":"Bad Request","statusCode":400}
# HTTP 400
```

Confirma, na prática: upload válido (202, `deduplicated:false`), duplicata
(202, `deduplicated:true`, mesmo `documentId`) e formato inválido (400, sem
persistir nada). Uma primeira tentativa desta validação manual falhou com
`HTTP 000` (conexão recusada pelo curl) — o processo em segundo plano usado
para o teste havia sido encerrado por um `timeout` do próprio comando de
shell antes de todas as chamadas terminarem, não um problema da aplicação;
repetida sem esse limite de tempo, funcionou normalmente.

## 14. CI

O workflow (`.github/workflows/ci.yml`) já provisionava um PostgreSQL de
serviço para as migrations, mas só executava `npm test` (testes de
unidade) — a suíte `test:e2e`, que é onde a maior parte dos testes T1–T10
desta tarefa vive, nunca havia rodado em CI, nem para o teste e2e que já
existia da foundation. Corrigi isso adicionando um passo `Testes e2e`
(`npm run test:e2e`) depois do passo de testes de unidade, reaproveitando o
mesmo contêiner de Postgres já provisionado — sem isso, a maior parte da
cobertura automatizada exigida pelo prompt (§16) nunca seria verificada de
fato em CI, só localmente. Push e acompanhamento dos runs de CI referentes
aos commits desta tarefa estão registrados na seção "Git" da resposta final
desta tarefa.

## 15. Audit

```bash
npm audit
npm audit --omit=dev
```

Ambos continuam reportando as mesmas 3 vulnerabilidades `high` em
`deepmerge-ts`, alcançadas via `prisma` (CLI, devDependency) →
`@prisma/config` → `deepmerge-ts` — o mesmo achado já registrado nos
relatórios 001 e 002, sem mudança de status nesta tarefa. Não apliquei
`npm audit fix --force` nem alterei a versão do Prisma.

## 16. Riscos e limitações

- **Arquivo órfão em storage em caso de falha de compensação.** Se
  `DocumentStorage.delete` falhar depois de uma falha genuína de banco (não
  o caso de corrida), o arquivo pode permanecer em disco sem `Document`
  correspondente. É registrado como aviso no log, mas não há rotina de
  limpeza automática nesta fase — risco conhecido, aceitável para o escopo
  atual.
- **`npm audit` com 3 vulnerabilidades `high`** em dependência de tooling
  (`deepmerge-ts` via Prisma CLI), não de runtime — já documentado nos
  relatórios anteriores.
- **Sem retenção de fixtures binários no repositório**: os arquivos de
  teste são gerados em memória (`test/support/image-fixtures.ts`) em vez de
  commitados como binários — decisão deliberada para manter o diff livre de
  arquivos binários, mas significa que qualquer alteração de formato requer
  editar esse gerador em vez de trocar um arquivo.
- **CI não rodava `test:e2e` até esta tarefa** (ver seção 14) — um gap
  pré-existente da foundation, descoberto e corrigido aqui porque a maior
  parte dos testes T1–T10 depende de PostgreSQL real.
- **`claimToken` (F-001) segue sem uso** nesta tarefa — o `ProcessingJob` é
  criado com o campo `null`, como esperado; a lógica de claim que o usa é
  trabalho futuro, fora de escopo.

## 17. O que ficou fora

Conforme o prompt (§20): nenhum worker, nenhuma query de claim ou
`FOR UPDATE SKIP LOCKED`, nenhum uso ativo de `claimToken`, nenhuma
recuperação de lease, nenhuma lógica de retry, nenhum processamento de IA
ou provider fake, nenhuma criação de `ProcessingRun`/`DocumentResult`,
nenhuma classificação ou extração, nenhum endpoint de listagem/consulta,
nenhuma fila de revisão, nenhum suporte a PDF, nenhuma autenticação,
nenhum frontend, nenhum deploy, nenhum storage remoto. Apenas o fluxo de
ingestão descrito nas seções 2–11 foi implementado.

## 18. Assistência do Claude nesta implementação

Toda a implementação desta tarefa — módulos `src/storage/` e
`src/documents/`, a alteração em `src/app.module.ts`, a correção do padrão
`.gitignore` que ignorava `src/storage/` sem querer (descoberta durante a
preparação do commit desta tarefa), a suíte de testes T1–T10 e este
relatório — foi gerada por mim (Claude) nesta tarefa, a partir do prompt em
`docs/ai/prompts/claude/03-claude-document-ingestion-prompt.md`. Não fiz
revisão humana desta implementação — essa revisão ainda não aconteceu e não
é responsabilidade minha realizá-la.
