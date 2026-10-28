# Sistema de Acionamento Logístico

Aplicação interna para gestão de escalas mensais, acionamento diário de condutores, jornadas, avisos operacionais, relatórios e integração com o SIGhRA.

Produção: [sistema-acionamento.vercel.app](https://sistema-acionamento.vercel.app)

## Stack

- Next.js 16 (App Router), React 19 e TypeScript
- Tailwind CSS
- Supabase: PostgreSQL, Auth, Row Level Security e Realtime
- Vercel: hospedagem e publicação da aplicação
- Ponte SIGhRA: agente executado na rede da empresa
- Playwright e Node Test Runner para testes

## Requisitos

- Node.js 22 LTS recomendado (mínimo aceito pelo Next.js: 20.9)
- npm
- Projeto Supabase configurado
- Supabase CLI somente para aplicar ou inspecionar migrações

## Configuração local

```bash
git clone https://github.com/dxzin/sistema-acionamento.git
cd sistema-acionamento
npm ci
```

Copie `.env.example` para `.env.local` e preencha apenas com credenciais do ambiente autorizado. Nunca registre `.env.local` no Git.

Variáveis essenciais:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Para executar:

```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`.

## Validação

Antes de enviar alterações:

```bash
npm run verify
```

Esse comando executa ESLint, testes automatizados e o build de produção. Testes de interface podem ser executados separadamente com `npm run test:e2e`.

## Banco de dados

O schema é versionado em `supabase/migrations`. As migrações devem ser aplicadas em ordem e nunca devem ser reescritas depois de utilizadas em um ambiente compartilhado.

Dados operacionais, usuários, chaves e exportações do banco não fazem parte deste repositório.

## Publicação

A branch `main` está conectada à Vercel. Um push nessa branch inicia uma publicação de produção. As variáveis sigilosas são cadastradas diretamente no provedor e não ficam no GitHub.

O sistema também suporta hospedagem própria como servidor Node.js com `npm run build` e `npm run start`. Consulte [Operação e recuperação](docs/OPERACAO_E_RECUPERACAO.md) antes de alterar a infraestrutura.

## Estrutura do repositório

```text
src/app/          páginas e rotas de API
src/components/   interface e grade operacional
src/lib/          regras, serviços, autenticação e integrações
supabase/         migrações do PostgreSQL
ponte-sighra/     agente instalado na rede da empresa
tests/            testes unitários e de integração
e2e/              testes de interface com Playwright
scripts/          manutenção, auditoria e importações controladas
docs/             documentação técnica, funcional e operacional
public/           arquivos públicos da aplicação
```

## Documentação

- [Arquitetura atual](docs/ARQUITETURA.md)
- [Documentação funcional](docs/DOCUMENTACAO_SISTEMA.md)
- [Regras de negócio](docs/REGRAS_NEGOCIO.md)
- [Operação e recuperação](docs/OPERACAO_E_RECUPERACAO.md)
- [Ponte SIGhRA](docs/PONTE_SIGHRA.md)
- [API de consulta da escala](docs/API_DASHBOARD.md)
- [Índice completo](docs/README.md)

## Segurança

Consulte [SECURITY.md](SECURITY.md). A `SUPABASE_SERVICE_ROLE_KEY`, os tokens da ponte e credenciais do SIGhRA são segredos de servidor e nunca podem ser expostos no navegador, em logs, issues ou commits.

