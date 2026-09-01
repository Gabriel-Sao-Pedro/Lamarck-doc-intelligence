# Fluxo de Trabalho com IA — Lamarck DOC Intelligence

## Objetivo

Organizar o uso de IA no projeto sem deixar decisões importantes escondidas e
sem transformar o processo em burocracia.

## Uso da IA

O Claude pode ser usado para implementação, análise técnica, testes e apoio na
documentação.

As decisões de escopo, arquitetura, contrato da API, state machine, ADRs e
aceite final continuam sendo humanas.

## Revisão humana

Mudanças relevantes passam por revisão humana antes do merge.

Na revisão eu quero conferir principalmente:
- se o código segue a especificação;
- se contratos compartilhados continuam coerentes;
- se concorrência/transações fazem sentido;
- se não há vazamento de PII;
- se testes e CI realmente passaram;
- se consigo explicar o que foi feito.

Se a revisão mostrar uma correção pequena, ela pode ser tratada normalmente.

Se a correção virar praticamente uma nova implementação — como regra prática,
mais de aproximadamente 30% da tarefa — prefiro devolver a implementação ao
Claude e revisar a nova versão.

## Prompts

Prompts de implementação devem ser objetivos e conter apenas o necessário para:
- explicar a tarefa;
- definir o que entra e o que não entra;
- apontar decisões já tomadas;
- indicar validações;
- dizer quando o Claude deve parar.

Os prompts relevantes ficam em:

`docs/ai/prompts/claude/`

## Branches

Usar branches focadas por tarefa.

Fluxo normal:

1. implementar;
2. revisar o diff;
3. commit/push;
4. executar CI/testes;
5. revisão humana;
6. corrigir falhas reais;
7. validar novamente;
8. merge.

Não fabricar falhas.

## Problemas encontrados

Quando aparecer um erro real:
- registrar o problema;
- explicar o impacto;
- corrigir;
- rodar novamente as validações relevantes.

Não é necessário criar um arquivo separado para todo erro pequeno.

### Exemplo registrado: erro do próprio Claude ao citar evidência de Git

Na auditoria técnica end-to-end da Fase 3, o Claude afirmou que nove commits
específicos da Fase 3 carregavam o trailer `Co-Authored-By: Claude` no
relatório de auditoria. Três desses nove (`396902a`, `f86a9dd`, `3183914`)
na verdade não têm nenhum trailer — o Claude generalizou incorretamente a
partir dos cinco commits da Fase 3.1 que de fato carregam o trailer.

Eu percebi a inconsistência ao pedir confirmação direta ("alguém consegue
confirmar o DOC-003 pelo GitHub?"), o que levou o Claude a reconferir cada
um dos nove commits individualmente com `git log --format`. O Claude
corrigiu a afirmação no mesmo turno, discriminando exatamente quais dos
nove commits carregam o trailer e quais não, e deixou explícito que a
autoria da Fase 3.2/3.3 não é verificável só pelo histórico público do
GitHub — só pelo conteúdo desta conversa. Nenhum commit foi alterado; só a
citação textual da evidência foi corrigida.

## Quality gate

Uma tarefa só está pronta quando:
- o escopo foi atendido;
- os testes relevantes foram executados;
- a CI foi verificada;
- os riscos restantes estão claros;
- a revisão humana foi concluída quando necessária.
