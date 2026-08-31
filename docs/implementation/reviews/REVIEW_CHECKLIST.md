# Checklist de revisão humana

Use este checklist quando uma tarefa relevante estiver pronta para aceite.

## O que eu confiro

- O que foi implementado bate com a especificação?
- Houve mudança de arquitetura ou contrato sem decisão anterior?
- O código adicionou complexidade que não precisava?
- As transações e regras de concorrência fazem sentido?
- Existe risco de dois processos alterarem o mesmo dado de forma incorreta?
- Logs e erros evitam PII?
- Os testes cobrem o comportamento mais importante?
- Build, lint, testes e CI foram realmente executados?
- Consigo explicar a solução sem depender do Claude?

## Quando pedir correção

Se eu encontrar um problema pequeno, registro o ponto e peço a correção.

Se a correção exigir refazer mais ou menos um terço da tarefa ou mais, não tento
reescrever tudo durante a revisão: devolvo a implementação para o Claude com um
novo escopo e reviso novamente depois.
