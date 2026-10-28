# Arquitetura do Sistema de Acionamento

Documento de referência técnica do código em produção. Atualizado em 28/10/2026.

## Visão geral

```text
Navegador dos operadores
        |
        | HTTPS
        v
Aplicação Next.js na Vercel
        |                         PC/notebook na rede da empresa
        | HTTPS / Supabase API              |
        v                                    | MySQL local
Supabase                                    v
PostgreSQL + Auth + Realtime <---- APIs da ponte SIGhRA
```

A maior parte da interface é executada no navegador. Dados operacionais são lidos e gravados no Supabase com a sessão autenticada. Operações privilegiadas e a integração SIGhRA passam por Route Handlers do Next.js.

## Camadas

### Interface

- `src/app`: páginas do App Router e rotas HTTP.
- `src/components`: layout, filtros, indicadores e grade operacional.
- `src/types`: contratos de banco e modelos de domínio.

Principais módulos: Acionamento, Escala Mensal, Condutores, Consulta SIGhRA, Quadro de Avisos, Histórico, Relatórios e Administração.

### Domínio e serviços

- `src/lib/services/dispatch-service.ts`: folhas diárias e acionamentos.
- `src/lib/services/schedule-service.ts`: escala mensal.
- `src/lib/services/driver-service.ts`: cadastro e parâmetros dos condutores.
- `src/lib/services/report-service.ts`: consolidação de relatórios.
- `src/lib/calculations/journey-close-deadline.ts`: limites de fechamento de jornada.
- `src/lib/sighra`: fila, validação, associação e aplicação de jornadas SIGhRA.

Regras importantes possuem testes em `tests/`.

### Aplicação no servidor

Os Route Handlers em `src/app/api` atendem operações que não podem expor credenciais privilegiadas:

- resolução controlada de locais e frotas;
- consulta externa de escala;
- monitoramento administrativo do Supabase;
- fila, auditoria e preenchimento da integração SIGhRA.

O arquivo `src/proxy.ts` renova a sessão Supabase e protege páginas autenticadas. APIs realizam suas próprias validações de autenticação e autorização.

### Banco e autenticação

O Supabase fornece:

- PostgreSQL;
- Supabase Auth;
- Row Level Security;
- Realtime;
- funções SQL transacionais;
- auditoria por triggers.

O schema é reproduzível pelas migrações de `supabase/migrations`. A chave anônima é usada pelo navegador. A chave `service_role` existe somente no ambiente do servidor.

### Ponte SIGhRA

O agente em `ponte-sighra/` é executado dentro da rede que acessa o banco SIGhRA. Ele mantém um sinal de disponibilidade, busca tarefas autorizadas e devolve resultados validados para as APIs do sistema.

A aplicação não abre conexão direta da Vercel com o MySQL interno. Tokens distintos permitem alternar entre o PC da empresa e o notebook de contingência.

## Fluxos principais

### Edição da grade

1. O operador autentica no Supabase.
2. A aplicação carrega folha, condutores e catálogos.
3. A edição é validada no navegador.
4. Uma função transacional grava a alteração e a auditoria.
5. Realtime notifica outros operadores; uma verificação periódica funciona como contingência.

### Consulta SIGhRA

1. O operador solicita uma jornada.
2. A API cria uma tarefa vinculada ao usuário e com expiração.
3. A ponte ativa busca a tarefa pela internet usando seu token.
4. O agente consulta o MySQL local e devolve apenas os dados permitidos.
5. A API valida login, datas, horários, placas e tamanho da resposta.
6. O operador revisa o resultado antes de aplicá-lo à grade.

## Ambientes

- Desenvolvimento: `npm run dev`, com variáveis locais ignoradas pelo Git.
- Testes: Node Test Runner e Playwright.
- Produção: Vercel conectada à branch `main`.
- Banco: projeto Supabase gerenciado.
- Integração interna: ponte PowerShell ou Node.js na rede da empresa.

## Decisões de segurança

- Dados operacionais não são versionados no Git.
- Rotas privilegiadas usam segredos apenas no servidor.
- Escritas críticas são transacionais e auditadas no banco.
- A ponte usa acesso de saída; o MySQL não é exposto à internet.
- Mensagens e resultados da ponte passam por allowlists e validação estrutural.

## Implantação alternativa

O Next.js pode ser executado com `npm run build` e `npm run start` em um único servidor Node.js. Em hospedagem própria, deve existir proxy reverso com HTTPS, atualização do sistema operacional, reinício automático, monitoramento e gestão segura das variáveis.
