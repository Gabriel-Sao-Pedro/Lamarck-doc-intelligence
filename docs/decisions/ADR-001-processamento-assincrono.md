# ADR-001 — Processamento assíncrono

## Status

Aceito

## Contexto

O sistema precisa receber documentos e depois processá-los usando um serviço de
inteligência documental.

Esse processamento não é instantâneo. O serviço externo pode levar vários
segundos para responder e também pode falhar, atingir timeout ou ficar
indisponível.

Se eu fizer todo o processamento dentro da própria requisição de upload, a API
fica esperando essa resposta terminar antes de responder ao cliente.

Isso deixaria o endpoint mais lento, mais sujeito a timeout e mais dependente da
disponibilidade do provider.

---

## Decisão

Decidi separar o recebimento do documento do processamento.

O fluxo será:

`upload -> validação -> persistência -> criação do job -> resposta 202`

Depois disso, o processamento continua em segundo plano através de um worker.

O endpoint de upload não precisa esperar a extração dos dados terminar.

---

## Por que escolhi isso

O principal motivo é desacoplar duas partes com comportamentos bem diferentes.

O upload precisa ser rápido e previsível.

Já o processamento pode:

- levar vários segundos;
- falhar;
- precisar de retry;
- depender de um serviço externo.

Separar essas etapas permite que a API confirme o recebimento do documento sem
ficar presa à execução do provider.

Também facilita tratar retry e falhas sem obrigar o cliente a reenviar o
arquivo.

---

## Alternativas consideradas

### Processar tudo dentro do `POST /documents`

Seria mais simples no começo porque não precisaria de worker nem job.

Não escolhi essa opção porque a requisição ficaria aberta durante toda a chamada
ao provider.

Isso aumenta a chance de timeout e mistura a responsabilidade de receber o
arquivo com a responsabilidade de processá-lo.

### Processamento assíncrono

Foi a opção escolhida.

Ela adiciona um pouco de complexidade, porque passa a existir um job e um
worker, mas deixa o comportamento da API mais adequado para uma operação lenta
e sujeita a falhas.

---

## Consequências

Com essa decisão:

- o upload pode responder antes do processamento terminar;
- o cliente precisa consultar o estado depois;
- o sistema precisa manter estados de processamento;
- passa a existir uma fila ou mecanismo de jobs;
- retry deixa de depender da requisição original;
- falhas do provider não precisam derrubar o endpoint de upload.

Também significa que `202 Accepted` passa a fazer sentido como resposta para o
envio de um documento que ainda será processado.

---

## Limitações

Essa decisão não resolve sozinha:

- como os jobs serão armazenados;
- como dois workers evitam pegar o mesmo job;
- como retries serão controlados;
- como recuperar um job se um worker cair.

Esses pontos serão tratados em outras decisões e na implementação.

---

## Quando eu mudaria essa decisão

Eu reconsideraria processamento assíncrono somente se a operação passasse a ser
realmente rápida, previsível e sem dependência externa relevante.

Enquanto o processamento puder levar vários segundos e estiver sujeito a
falhas, manter upload e processamento separados continua fazendo mais sentido.
