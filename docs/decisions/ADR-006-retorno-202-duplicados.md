# ADR-006 — Retorno 202 também para documentos duplicados

## Status

Aceito

## Contexto

O endpoint `POST /documents` será usado para receber documentos e iniciar o
fluxo de processamento.

Quando um documento novo é aceito, faz sentido responder com:

`202 Accepted`

porque o processamento ainda vai acontecer em segundo plano.

O ponto que gera dúvida é o caso em que o mesmo arquivo já foi enviado antes.

Nesse cenário, o sistema não cria um novo documento e também não cria um novo
job. Ele apenas reaproveita o documento que já existe.

Uma opção seria responder com outro status HTTP para diferenciar esse caso.

Outra opção seria manter o mesmo status da ingestão e deixar a diferença clara
no corpo da resposta.

---

## Decisão

Vou manter:

`202 Accepted`

tanto para documentos novos quanto para documentos duplicados.

A diferença ficará explícita no corpo da resposta.

Documento novo:

```json
{
 "documentId": "uuid",
 "status": "RECEIVED",
 "deduplicated": false
}
```

Documento já existente:

```json
{
 "documentId": "uuid-do-documento-existente",
 "status": "COMPLETED",
 "deduplicated": true
}
```

No caso duplicado, o campo `status` representa o estado atual do documento que
já existia.

Por isso ele não precisa ser `RECEIVED`.

Ele pode estar, por exemplo, em:

- `PROCESSING`;
- `RETRYING`;
- `COMPLETED`;
- `NEEDS_REVIEW`;
- `FAILED`.

---

## Por que escolhi isso

Minha intenção é manter o contrato do endpoint simples para o sistema que faz o
envio.

Quem chama `POST /documents` recebe sempre uma confirmação de que aquele
conteúdo foi aceito pelo sistema e passa a trabalhar com um `documentId`.

O cliente não precisa decidir o próximo passo com base em vários status HTTP
diferentes para novo e duplicado.

A informação importante para diferenciar os casos já aparece em:

`deduplicated`

Isso deixa claro se o sistema criou um novo documento ou reaproveitou um
registro anterior.

---

## O trade-off

Essa não é a única interpretação possível do HTTP.

No caso duplicado, não existe exatamente um novo processamento sendo aceito.

O documento já existia.

Por isso, também seria defensável retornar:

`200 OK`

principalmente se o processamento daquele documento já tiver terminado.

Mesmo assim, preferi um contrato uniforme nesta primeira versão.

Estou tratando o `POST /documents` como a porta de entrada da ingestão, e o
resultado da operação é sempre uma referência válida para o documento associado
àquele conteúdo.

Quero deixar esse trade-off registrado porque não considero `202` a única
resposta possível.

Foi uma escolha de contrato, não uma regra absoluta.

---

## Alternativas consideradas

### `200 OK` para duplicado

Seria semanticamente simples quando o sistema apenas retorna um recurso que já
existe.

Não escolhi porque faria o consumidor tratar documento novo e duplicado de forma
diferente no nível do status HTTP.

### `409 Conflict`

Não escolhi porque duplicidade não é um erro para este fluxo.

O sistema consegue resolver a situação automaticamente retornando o documento
já existente.

Não quero obrigar o cliente a tratar o reenvio do mesmo arquivo como falha.

### `303 See Other`

Poderia apontar para o recurso existente.

Não escolhi porque adicionaria um comportamento menos comum para uma API desse
tipo e não traria benefício suficiente para esta entrega.

### `202 Accepted` nos dois casos

Foi a opção escolhida porque deixa o contrato de ingestão mais uniforme.

A distinção fica no corpo da resposta.

---

## Consequências

Com essa decisão:

- o cliente recebe o mesmo status HTTP em upload novo e duplicado;
- `deduplicated` passa a ser parte importante do contrato;
- `documentId` sempre aponta para o recurso que deve ser consultado;
- o status retornado pode ser diferente de `RECEIVED` quando o documento já
 existia;
- a API precisa documentar claramente esse comportamento;
- existe um trade-off semântico que precisa continuar visível.

---

## Relação com a deduplicação

Essa decisão não muda a regra de deduplicação.

Se o SHA-256 já existir:

- não será criado outro `Document`;
- não será criado outro job;
- não será mantida outra cópia do arquivo;
- será retornado o documento existente.

O `202 Accepted` define apenas como a API comunica esse resultado ao cliente.

---

## Quando eu mudaria essa decisão

Eu reconsideraria esse contrato se os consumidores da API mostrarem que precisam
distinguir novo e duplicado diretamente pelo status HTTP.

Também poderia mudar se a API evoluir para um padrão em que:

- criação de recurso;
- consulta de recurso existente;
- idempotência;

tenham contratos separados.

Nesse caso, `200 OK` para duplicado pode fazer mais sentido.

Para esta primeira versão, prefiro manter o contrato simples e deixar a
diferença explícita no corpo da resposta.
