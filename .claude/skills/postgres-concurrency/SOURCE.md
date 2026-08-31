# Origem deste conteúdo

Os arquivos em `references/` foram copiados (vendorizados), sem modificação de
conteúdo técnico, a partir do repositório oficial da Supabase:

- Repositório: https://github.com/supabase/agent-skills
- Skill original: `skills/supabase-postgres-best-practices/`
- Licença: MIT (ver `LICENSE` neste diretório — texto original preservado)
- Versão da skill original: `1.1.1` (conforme `SKILL.md` da fonte)
- Commit de referência do branch `main` no momento da cópia: `8331f910845103c08d51f6ca1d86ebb7d1f745e3` (2026-08-12T07:36:50Z)
- Verificação: conteúdo obtido via GitHub API (`gh api repos/supabase/agent-skills/contents/...`)
  em 2026-08-31, não por busca web — confere com o blob sha de cada arquivo abaixo.

## Por que vendorizado em vez de instalado via plugin marketplace

O pacote original (`supabase-postgres-best-practices`) tem 32 arquivos de
referência cobrindo 8 categorias (query performance, connection pooling,
Row-Level Security, JSONB, full-text search, particionamento, etc.), a maioria
irrelevante para este projeto ou específica do Supabase hospedado (RLS,
pooler do Supabase). Em vez de instalar o pacote inteiro globalmente via
`claude plugin marketplace add supabase/agent-skills`, foram copiados apenas
os 5 arquivos diretamente aplicáveis à fila persistida em PostgreSQL e à
deduplicação por SHA-256 deste projeto, mantendo tudo dentro do repositório
(escopo do projeto, versionável), sem alterar configuração global do usuário.

## Arquivos incluídos e sha do blob original (para auditoria/rastreabilidade)

| Arquivo | sha (git blob, repo supabase/agent-skills) |
|---|---|
| `references/lock-skip-locked.md` | `77bdbb97045010ce2fdbd90733e8f764be82881a` |
| `references/lock-deadlock-prevention.md` | `974da5edec32f79de0fcdc771d4ef759dc3e049d` |
| `references/lock-advisory.md` | `572eaf0dcf518ac925c4cde41beb60b62852b79c` |
| `references/lock-short-transactions.md` | `e6b8ef2633248a4aa4394628e48d8cb693e7e6ab` |
| `references/data-upsert.md` | `bc95e2305d955679446c70854cb2b56b183aa56d` |

Para verificar integridade/atualização, comparar com:
`https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/<arquivo>`
