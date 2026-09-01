# Fase 3.3 — Correção humana e controle de versão

## 1. Ação

Quero implementar manualmente a próxima parte da revisão humana.

Agora que já existe fila e claim, quero permitir que o revisor corrija os campos extraídos pela IA sem sobrescrever silenciosamente alterações feitas em outra tela ou por outra tentativa.

Não implemente por mim.

Quero que você me ajude a fechar o desenho e me dê uma ordem segura para eu escrever o código.

---

## 2. Contexto

Hoje o projeto já tem:

```text
GET /reviews
POST /reviews/:documentId/claim
ReviewClaim
reviewerId
claimToken
lease de 15 minutos
fencing
```

A próxima rota deve ser algo como:

```http
PATCH /reviews/:documentId
```

A correção só pode acontecer quando o claim ainda é válido.

Também preciso preservar o resultado original da IA. Não quero substituir o que o provider produziu como se nunca tivesse existido.

A implementação desta fase será feita por mim.

O Claude deve atuar apenas como orientação e depois como reviewer.

---

## 3. Papel

Atue como meu orientador técnico.

Antes de sugerir uma solução, leia o schema, o módulo de reviews, o fluxo de `DocumentResult`, os testes existentes, a specification, architecture e ADRs.

Me ajude a decidir:

```text
como persistir a correção
como controlar version
como validar claimToken
como tratar lease expirado
como preservar resultado original
como montar resultado efetivo
quando retornar 409
```

Não escreva service, controller, migration ou testes completos.

---

## 4. Dados de entrada e referências

Quero trabalhar com um contrato próximo deste:

```json
{
  "claimToken": "...",
  "version": 1,
  "corrections": {
    "fullName": "...",
    "birthDate": "..."
  }
}
```

A operação deve exigir:

```text
documento em NEEDS_REVIEW
claim existente
claimToken atual
lease não expirado
version atual
```

Se a versão enviada estiver velha:

```text
409 Conflict
```

Se o claim estiver inválido ou expirado:

```text
409 Conflict
```

O `reviewedBy` não deve vir livremente do body. Quero que ele seja derivado do claim válido.

Para o documento atual, os campos corrigíveis são os campos de negócio que já existem:

```text
fullName
parentage
birthDate
documentNumber
issuingAuthority
```

Quero preservar separadamente:

```text
resultado original da IA
correção humana
resultado efetivo
```

Me ajude a decidir a estrutura mais simples para isso sem quebrar a arquitetura atual.

Também me ajude a decidir se, depois da correção, o documento deve continuar em `NEEDS_REVIEW` ou ir para `COMPLETED`. Não crie status novo sem necessidade.

Os testes precisam cobrir pelo menos:

```text
correção válida
claim inexistente
token errado
lease expirado
version correta
version antiga
preservação do resultado original
reviewedBy vindo do claim
campo inválido
API key
duas correções concorrentes com a mesma version
regressão
```

O teste de concorrência é importante: duas correções com a mesma versão devem resultar em uma única vencedora.

---

## 5. Formato de saída

Organize assim:

### 1. O que estou construindo

Explique o objetivo da Fase 3.3 em linguagem simples.

### 2. Decisões que preciso tomar antes de codar

Liste somente as decisões realmente necessárias.

### 3. Persistência recomendada

Mostre como separar resultado da IA, correção humana e resultado efetivo.

### 4. Contrato recomendado

Proponha request, response e códigos HTTP.

### 5. Optimistic locking

Explique como implementar sem deixar janela de corrida.

### 6. Validação do claim

Explique como claimToken e lease entram na operação.

### 7. Arquivos que provavelmente vou tocar

Liste sem escrever o conteúdo.

### 8. Ordem de implementação

Me dê uma sequência prática.

### 9. Testes

Liste os cenários e explique o que cada um precisa provar.

### 10. Erros comuns

Aponte principalmente:

```text
sobrescrever resultado original
confiar em reviewerId enviado pelo cliente
comparar version fora de operação atômica
aceitar claim expirado
logar PII
antecipar filename/provider/reprocessamento
```

### 11. Checklist de pronto

Checklist curta para eu saber quando pedir a revisão adversarial.

---

## 6. Restrições e limites

Não implemente por mim.

Não gere código completo.

Não gere migration completa.

Não gere patch ou diff.

Não escreva testes completos.

Não faça commit ou push.

Não implemente ainda:

```text
filename padronizado
provider multimodal real
segundo tipo documental
reprocessamento
```

Não atribua a si mesmo autoria da implementação.

O objetivo é eu entender o desenho e implementar manualmente.
