# Auditoria de segurança — Sistema de Acionamento

Data: 13/09/2026  
Escopo: aplicação Next.js, APIs, Supabase/PostgreSQL, autenticação, autorização, importação/exportação, segredos, dependências, operação e pipeline.

## Resumo executivo

O risco geral é **alto para integridade e rastreabilidade caso o sistema entre em produção no estado atual**, embora não tenha sido confirmada uma vulnerabilidade crítica explorável sem autenticação. As páginas protegidas redirecionam usuários sem sessão, as duas APIs rejeitam chamadas sem token, o RLS está habilitado, não há SQL dinâmico, o React escapa o conteúdo exibido, os segredos locais estão ignorados pelo Git e o `npm audit` não encontrou vulnerabilidades conhecidas nas 588 dependências instaladas.

Os principais riscos estão depois do login. Um usuário autenticado pode escrever diretamente em tabelas operacionais pelo endpoint REST público do Supabase, contornando as funções que geram auditoria. Além disso, a função de atualização aceita do navegador campos derivados e de aprovação, como tempo trabalhado, próxima previsão e nome do autorizador do abono, sem recalculá-los ou verificar o papel do usuário no banco. Isso permite adulteração operacional com aparência de dado legítimo.

A separação por base/região ainda não está implementada: as políticas permitem leitura ampla e todos os cinco perfis atuais estão sem `base_id`. A tela de login também promove uma conta compartilhada de homologação, o que enfraquece a atribuição da auditoria se várias pessoas usarem a mesma credencial.

Foram aplicadas três correções de baixo risco: cabeçalhos HTTP básicos, neutralização de fórmulas em CSV e endurecimento das APIs contra JSON malformado, corpo excessivo e vazamento de erro interno. As mudanças arquiteturais de autorização e auditoria ficaram pendentes porque exigem migração coordenada e podem interromper o fluxo operacional atual.

## Contexto e arquitetura observada

- Next.js 16.3.5 com App Router, React 19 e TypeScript.
- Frontend predominantemente cliente, acessando Supabase diretamente com a chave pública `anon`.
- Supabase Auth, PostgreSQL, RLS, Realtime e funções RPC em PL/pgSQL.
- Duas Route Handlers (`/api/fleets/resolve` e `/api/locations/resolve`) usam `service_role` apenas no servidor.
- Importação `.xlsx` processada no navegador com ExcelJS; exportações `.xlsx` e `.csv` também são geradas no navegador.
- Vercel como hospedagem; Supabase como persistência e autenticação.
- Não há contêiner, `vercel.json`, workflow de CI/CD ou configuração Supabase Auth versionada.
- O ambiente vinculado possui cinco usuários/perfis: três operadores, um supervisor e um administrador; todos estão sem base associada.

## Metodologia e limitações

Foram revisados código, migrações, documentação, scripts operacionais, dependências, arquivos rastreados e histórico Git. Também foram executados `npm audit`, lint, testes, build, `supabase db lint --linked` e verificações HTTP não destrutivas no ambiente publicado e no build local.

Não foram feitos testes destrutivos, criação de usuário, tentativa de força bruta, alteração de dados de produção ou exploração ativa de contas. Configurações gerenciadas fora do repositório — política de senha, cadastro público, CAPTCHA, MFA, retenção de logs, proteção de branch e opções do projeto Vercel/Supabase — não puderam ser confirmadas. Sua ausência no código é tratada como falta de evidência, não como vulnerabilidade confirmada.

## Achados

### SEC-01 — Escrita direta contorna a auditoria operacional

- **Severidade:** Alta
- **Classificação:** Vulnerabilidade confirmada
- **Evidência:** `20260912050000_daily_sheet_locking_and_atomic_audit.sql:5-32` permite `INSERT`, `UPDATE` e `DELETE` de despachos em folhas abertas para qualquer usuário autenticado. `20260912080000_security_sync_and_batch.sql:6-13` permite inserir e atualizar folhas diárias. A aplicação usa as RPCs auditadas em `dispatch-service.ts:598-602` e `643-645`, mas as permissões de tabela continuam acessíveis diretamente com a chave pública e uma sessão válida.
- **Cenário/impacto:** um operador autenticado ou uma sessão comprometida chama diretamente a API REST do Supabase para alterar/excluir um despacho ou mudar uma folha sem passar por `update_dispatch_with_audit`/`set_daily_sheet_status`. A trilha fica incompleta, prejudicando integridade, investigação e responsabilização.
- **OWASP:** Top 10 A01:2021 Broken Access Control; API Top 10 API1:2023 BOLA; ASVS V4 Access Control e V7 Error/Logging.
- **Remediação:** revogar `UPDATE`/`DELETE` direto em `dispatches` e `UPDATE` direto em `daily_sheets`; mover criação/reconciliação para RPCs transacionais de privilégio mínimo; idealmente adicionar trigger de auditoria como última barreira, garantindo registro mesmo fora da UI. Funções `SECURITY DEFINER` devem validar `auth.uid()`, papel, região, estado da folha e manter `search_path` fixo.
- **Componentes afetados:** políticas RLS de `dispatches`/`daily_sheets`, funções RPC, `src/lib/services/dispatch-service.ts`.
- **Quebra/migração:** sim. O cliente hoje faz `upsert` direto ao criar/reconciliar folhas; revogar permissões antes de substituir esse fluxo interrompe a operação.
- **Testes necessários:** chamadas REST diretas de `UPDATE`/`DELETE` devem retornar 401/403; RPC autorizada deve funcionar somente em folha aberta; cada alteração deve criar exatamente um log com usuário e valores anterior/novo; corrida de criação e colagem em lote deve permanecer atômica.

### SEC-02 — Aprovações e campos derivados são confiados ao navegador

- **Severidade:** Alta
- **Classificação:** Vulnerabilidade confirmada
- **Evidência:** `20260912080000_security_sync_and_batch.sql:51-56` inclui `abono_authorized_by`, `next_day_forecast_time` e `total_worked_minutes` na lista aceita. As linhas 79-95 gravam esses valores fornecidos pelo cliente. A função exige apenas `auth.uid()` nas linhas 58-60; não há verificação de supervisor para aprovação. `dispatch-service.ts:566-574` calcula jornada e próxima previsão no navegador.
- **Cenário/impacto:** qualquer conta autenticada pode forjar o nome de um aprovador, diminuir a jornada registrada ou escolher uma próxima previsão incompatível com entrada/saída. Relatórios usam `total_worked_minutes` salvo quando presente, fazendo o valor adulterado prevalecer sobre o cálculo.
- **OWASP:** A01 Broken Access Control; A04 Insecure Design; API5 Broken Function Level Authorization; ASVS V4 e V5 Validation.
- **Remediação:** calcular jornada e próxima previsão dentro da transação no banco; remover campos derivados da lista gravável; criar ação específica de aprovação que exija papel `supervisor`/`admin` e grave `approved_by_user_id` e horário, mantendo nome apenas para apresentação; validar transições de status no servidor.
- **Componentes afetados:** RPC `update_dispatch_with_audit`, schema de `dispatches`, relatórios e serviço de despacho.
- **Quebra/migração:** sim. Requer colunas de identidade da aprovação, backfill e adaptação do cliente.
- **Testes necessários:** adulteração manual dos campos deve ser rejeitada/ignorada; resultados devem ser recalculados no banco; operador não aprova, supervisor aprova; auditoria deve guardar a identidade real; casos de virada de meia-noite e edição parcial precisam continuar corretos.

### SEC-03 — Conta compartilhada reduz a não repudiação

- **Severidade:** Alta antes de produção
- **Classificação:** Risco provável (o uso simultâneo real não foi observado)
- **Evidência:** `src/app/login/page.tsx:11` preenche `torre@torre.com.br`; as linhas 103-107 identificam a conta como “compartilhada de homologação”. A auditoria usa somente `auth.uid()` (`20260912080000_security_sync_and_batch.sql:106-107`). Existem cinco contas no ambiente, portanto a infraestrutura para identidades individuais já existe, mas a interface ainda promove a compartilhada.
- **Cenário/impacto:** várias pessoas operam com o mesmo usuário; não é possível atribuir uma alteração a uma pessoa, revogar apenas um operador ou investigar comprometimento individual. O compartilhamento também aumenta a chance de vazamento e reutilização da senha.
- **OWASP:** A07 Identification and Authentication Failures; ASVS V2 Authentication e V3 Session Management.
- **Remediação:** emitir conta individual por operador; retirar conta/e-mail compartilhado da interface; desativar a credencial compartilhada antes do go-live; exigir senha forte e MFA para admin/supervisor; revisar sessões ativas e processo de desligamento.
- **Componentes afetados:** Supabase Auth, `profiles`, login e processo operacional.
- **Quebra/migração:** exige rollout de usuários e treinamento, mas não migração de dados de negócio. Logs antigos da conta compartilhada não podem ser reatribuídos com segurança.
- **Testes necessários:** login/logout/expiração por usuário; revogação individual; MFA de privilegiados; auditoria exibindo identidade distinta; conta antiga deve falhar após corte.

### SEC-04 — APIs com `service_role` não aplicam autorização funcional

- **Severidade:** Média
- **Classificação:** Vulnerabilidade confirmada de função; impacto limitado às tabelas de referência
- **Evidência:** `src/app/api/fleets/resolve/route.ts:14-34` e `locations/resolve/route.ts:14-47` validam somente que existe um usuário e depois inserem com `SUPABASE_SERVICE_ROLE_KEY`, que ignora RLS. Isso contorna as políticas originais que restringem alteração de `vehicles` e `locations` a supervisor/admin (`20260910000000_initial_schema.sql:284-290`).
- **Cenário/impacto:** qualquer operador ou token roubado pode criar grande quantidade de frotas/destinos, poluir catálogos e consumir banco. Não há auditoria dessas criações nem limite distribuído por usuário.
- **OWASP:** API5 Broken Function Level Authorization; API4 Unrestricted Resource Consumption; A01 Broken Access Control.
- **Remediação:** substituir o uso geral de `service_role` por RPC específica de privilégio mínimo, decidir explicitamente se operador pode criar referência durante o despacho, registrar criador e aplicar cota/rate limit quando houver abuso observável. Se criação for restrita, verificar papel no servidor antes da mutação.
- **Componentes afetados:** duas Route Handlers, políticas de `vehicles`/`locations`, fluxo de digitação da grade.
- **Quebra/migração:** potencial. Restringir somente a supervisores mudaria o fluxo atual; uma RPC que preserve a capacidade do operador pode ser migrada sem mudança visual.
- **Testes necessários:** matriz operador/supervisor/admin; usuário não pode alterar/excluir registros existentes; normalização e corrida de duplicidade; limite de requisições; auditoria do criador.

### SEC-05 — Não há isolamento por base ou região

- **Severidade:** Média
- **Classificação:** Risco provável (depende do requisito de segregação organizacional)
- **Evidência:** as políticas `SELECT` usam `USING (true)` para tabelas operacionais (`20260910000000_initial_schema.sql:261-271`). Escritas operacionais também não filtram região. Os cinco perfis atuais têm `base_id = null`, embora a coluna exista.
- **Cenário/impacto:** um operador de uma unidade consulta relatórios, escalas, condutores e histórico de todas as regiões e pode alterar qualquer folha aberta. Se as bases forem domínios de confiança distintos, isso configura BOLA e exposição excessiva.
- **OWASP:** A01 Broken Access Control; API1 BOLA; API3 Broken Object Property Level Authorization; ASVS V4.
- **Remediação:** aprovar uma matriz de acesso; preencher base/escopo dos perfis ou criar associação muitos-para-muitos; aplicar região nas políticas RLS e RPCs; reservar visão global para supervisor/admin. Não implementar isolamento sem confirmar se a torre central precisa enxergar todas as bases.
- **Componentes afetados:** `profiles`, RLS de todas as tabelas operacionais, relatórios, histórico, Realtime.
- **Quebra/migração:** sim; perfis sem escopo perderiam acesso. Exige backfill antes de ativar políticas.
- **Testes necessários:** testes negativos cruzando regiões para cada papel, inclusive REST direto, RPC, relatórios, exportação e eventos Realtime.

### SEC-06 — Exposição e personificação de identidade na presença online

- **Severidade:** Média
- **Classificação:** Vulnerabilidade confirmada, limitada a usuários autenticados
- **Evidência:** `profiles` permite leitura de todas as colunas por qualquer autenticado (`20260910000000_initial_schema.sql:262`). `operator_presence` também permite leitura global (`20260912070000_operator_presence.sql:17-18`). A RPC recebe `p_display_name` e `p_email` do navegador e os grava (`20260912090000_fix_presence_upsert.sql:16-25`) em vez de derivar do perfil autenticado.
- **Cenário/impacto:** um usuário enumera nomes, e-mails e papéis de outras contas. Também pode enviar nome/e-mail falso para aparecer como outra pessoa na indicação de edição simultânea; o `user_id` real permanece no registro, mas a interface pode induzir operadores ao erro.
- **OWASP:** API3 Broken Object Property Level Authorization; A01 Broken Access Control; ASVS V4 e V8 Data Protection.
- **Remediação:** limitar `profiles` ao próprio registro e expor uma view/RPC com somente campos públicos necessários; remover e-mail da presença se não for indispensável; derivar nome/e-mail no banco por `auth.uid()`; validar que `active_dispatch_id` pertence à folha/região informada.
- **Componentes afetados:** RLS de `profiles`/`operator_presence`, RPC de presença, histórico e UI colaborativa.
- **Quebra/migração:** possível; histórico hoje consulta todos os perfis para resolver nomes e deve migrar para view/RPC segura.
- **Testes necessários:** operador não lê e-mails/papéis de terceiros; histórico ainda mostra nomes permitidos; presença ignora identidade enviada pelo cliente; despacho de outra folha não pode ser marcado como ativo.

### SEC-07 — Ausência de gates automáticos de segurança e qualidade

- **Severidade:** Média
- **Classificação:** Risco provável de processo
- **Evidência:** não existe diretório `.github/workflows`, nem outro pipeline versionado. A documentação pede comandos manuais, e o repositório é publicado pela Vercel a partir da branch principal.
- **Cenário/impacto:** uma alteração pode chegar ao deploy sem lint, testes, build, verificação de segredos, análise de dependências ou teste de migrações. O risco é especialmente relevante porque a aplicação contém chave `service_role` no ambiente de deploy e políticas RLS complexas.
- **OWASP:** A08 Software and Data Integrity Failures; ASVS V1 Architecture e práticas de cadeia de fornecimento.
- **Remediação:** proteger `main`, exigir PR/review e workflow mínimo com `npm ci`, lint, testes e build. Adicionar secret scanning e dependency scanning; adicionar SAST focado em JS/TS. Validar migrações em Supabase local/efêmero em vez de usar produção em PRs.
- **Componentes afetados:** GitHub, Vercel, processo de release.
- **Quebra/migração:** não, mas pode bloquear merges que falhem até correção.
- **Testes necessários:** PR propositalmente quebrado deve ser bloqueado; segredo de teste deve ser detectado em branch descartável; achado alto de dependência deve impedir release conforme política aprovada.

### SEC-08 — Fórmula em CSV de auditoria

- **Severidade:** Baixa
- **Classificação:** Vulnerabilidade confirmada, corrigida nesta revisão
- **Evidência:** a exportação anterior apenas duplicava aspas e não neutralizava células começando por `=`, `+`, `-` ou `@`. Agora `src/lib/exports/csv.ts` prefixa esses valores com apóstrofo, inclusive após caracteres de controle/espaços, e `src/app/historico/page.tsx` usa a função.
- **Cenário/impacto:** conteúdo controlado que ocupasse o início de uma célula poderia ser interpretado como fórmula ao abrir o CSV no Excel, levando a links enganosos ou ações dependentes da configuração local. A explorabilidade era baixa porque os detalhes normalmente recebem um rótulo antes do valor.
- **OWASP:** A03 Injection; CWE-1236 CSV Formula Injection.
- **Remediação:** já aplicada; manter a função central e usá-la em futuras exportações CSV.
- **Componentes afetados:** exportação do histórico.
- **Quebra/migração:** não. Valores perigosos passam a ser exibidos como texto literal.
- **Testes necessários:** cobertos por `tests/csv-export.test.ts`; acrescentar teste de abertura em Excel no fluxo E2E se a exportação se tornar crítica.

### SEC-09 — Respostas das APIs expunham detalhes do banco

- **Severidade:** Baixa
- **Classificação:** Vulnerabilidade confirmada, corrigida nesta revisão
- **Evidência:** as Route Handlers retornavam `lookupError.message`/`createError.message`. Agora registram somente o código no servidor e devolvem mensagem genérica, `Cache-Control: no-store`, token Bearer estrito, tipo JSON obrigatório e limite de 2 KiB.
- **Cenário/impacto:** erros do PostgREST/PostgreSQL podiam revelar nomes de constraints, colunas e detalhes úteis para reconhecimento por um usuário autenticado.
- **OWASP:** A05 Security Misconfiguration; API8 Security Misconfiguration; ASVS V7.
- **Remediação:** já aplicada; evoluir para logging estruturado com identificador de correlação, sem PII ou token.
- **Componentes afetados:** `/api/fleets/resolve` e `/api/locations/resolve`.
- **Quebra/migração:** não para clientes válidos; clientes que enviem tipo incorreto ou JSON malformado passam a receber 4xx explícito.
- **Testes necessários:** 401 sem token, 415 sem JSON, 400 para JSON/tipo inválido, 413 acima de 2 KiB, 500 genérico sem mensagem interna e `no-store` em todas as respostas.

### SEC-10 — Cabeçalhos defensivos incompletos

- **Severidade:** Baixa
- **Classificação:** Melhoria de hardening, parcialmente corrigida
- **Evidência:** o ambiente publicado apresentava HSTS da Vercel, mas não retornava `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` ou `Permissions-Policy`. Esses cabeçalhos foram adicionados em `next.config.mjs` e `X-Powered-By` foi desabilitado.
- **Cenário/impacto:** ausência de proteção contra framing aumenta risco de clickjacking; MIME sniffing e permissões de recursos ficam menos restritos. Não foi identificada exploração direta associada.
- **OWASP:** A05 Security Misconfiguration; ASVS V14 Configuration.
- **Remediação:** já aplicada para os cabeçalhos de baixo risco. Avaliar CSP primeiro em `Content-Security-Policy-Report-Only`; não ativar uma política ampla com `unsafe-inline` apenas para cumprir checklist.
- **Componentes afetados:** configuração Next.js/Vercel.
- **Quebra/migração:** cabeçalhos aplicados não devem quebrar o app, desde que ele não precise ser embutido em iframe. CSP futura pode quebrar scripts/estilos e exige inventário.
- **Testes necessários:** verificar cabeçalhos no preview e produção; testar login, Supabase Realtime, downloads e impressão; monitorar relatórios CSP antes de bloquear.

### SEC-11 — Processamento de XLSX pode consumir memória do navegador

- **Severidade:** Baixa
- **Classificação:** Risco provável
- **Evidência:** `src/app/escala/page.tsx:203-210` limita o arquivo comprimido a 5 MiB antes de chamar `arrayBuffer`; `schedule-service.ts:181-186` carrega o ZIP inteiro no ExcelJS e só depois valida 2.000 linhas/100 colunas.
- **Cenário/impacto:** um `.xlsx` comprimido especialmente construído pode expandir muito e congelar ou encerrar a aba do operador. O arquivo não é enviado ao servidor, portanto o impacto fica no navegador que o abriu.
- **OWASP:** API4 Unrestricted Resource Consumption (analogia); práticas de validação de upload.
- **Remediação:** processar em Web Worker, inspecionar entradas ZIP/razão de expansão antes do parse quando possível, impor timeout/cancelamento e manter limites de linha/coluna. Não há necessidade de antivírus no servidor enquanto o arquivo permanecer exclusivamente local.
- **Componentes afetados:** importação de escala e ExcelJS.
- **Quebra/migração:** não; implementação em worker muda apenas processamento.
- **Testes necessários:** arquivo válido no limite, ZIP altamente compressível, workbook sem planilha, células ricas/fórmulas e cancelamento sem travar a UI.

### SEC-12 — Backups manuais seriam gravados em texto claro local

- **Severidade:** Baixa
- **Classificação:** Recomendação preventiva; nenhum backup foi encontrado no workspace
- **Evidência:** `scripts/backup-database.ps1:12-18` grava schema e dados SQL em `backups/`. A pasta está ignorada pelo Git, mas não há criptografia, retenção ou verificação de permissões no script.
- **Cenário/impacto:** quando executado, o dump contém dados operacionais e pode permanecer em notebook compartilhado, sincronização automática ou mídia sem proteção.
- **OWASP:** A02 Cryptographic Failures; ASVS V8 Data Protection.
- **Remediação:** definir destino protegido, criptografia em repouso, retenção curta, controle de acesso e teste periódico de restauração; evitar dumps em estações compartilhadas. A pasta ausente atualmente reduz o risco imediato.
- **Componentes afetados:** operação de backup e estações administrativas.
- **Quebra/migração:** não, mas muda o procedimento operacional.
- **Testes necessários:** restauração em ambiente isolado, expiração/remoção conforme retenção e confirmação de que usuários comuns não leem o backup.

## Controles positivos observados

- Middleware valida sessão com `supabase.auth.getUser()` no servidor e restringe `/admin` por perfil.
- APIs exigem Bearer válido; chamadas sem autenticação retornam 401.
- RLS está habilitado nas tabelas e o lint remoto do Supabase não encontrou erros de schema.
- Funções sensíveis recentes fixam `search_path` e revogam execução de `PUBLIC`.
- Atualizações em lote têm limite de 500, bloqueio ordenado e controle otimista de concorrência.
- Não há `dangerouslySetInnerHTML`, `eval`, SQL dinâmico, URL externa controlada pelo usuário, acesso a caminho de arquivo fornecido pelo cliente ou desserialização nativa insegura.
- A importação ocorre localmente, exige `.xlsx`, limita 5 MiB e valida dimensão lógica.
- `.env.local`, `.vercel`, backups e relatórios de teste estão ignorados; nenhum padrão de segredo foi encontrado no código atual ou histórico Git.
- `npm audit` retornou zero vulnerabilidades conhecidas; 32 testes, lint e build passaram.
- Vercel já fornece HTTPS e HSTS.

## Plano de remediação

### P0 — Corrigir imediatamente

1. Planejar e executar SEC-01 e SEC-02 em uma migração coordenada: impedir escrita direta não auditada, mover inicialização/reconciliação para RPC e tornar cálculo/aprovação server-side.
2. Antes do go-live, desativar a conta compartilhada (SEC-03) e entregar identidades individuais.
3. Rotacionar imediatamente `SUPABASE_SERVICE_ROLE_KEY` se houver qualquer suspeita de exposição; não há evidência atual de vazamento.

**Critérios de aceite do P0:** fluxo completo de acionamento continua funcional; REST direto não altera dados; toda mutação sensível possui log imutável; operador não forja aprovação/valores derivados; concorrência e Realtime continuam funcionando; rollback ensaiado em staging.

### P1 — Antes da produção ou próxima release

1. Definir matriz de acesso e decidir isolamento por base/região (SEC-05), preencher perfis antes de ativar RLS mais restritivo.
2. Substituir as APIs `service_role` por capacidade explícita e auditada (SEC-04).
3. Reduzir exposição de `profiles`/presença e derivar identidade no servidor (SEC-06).
4. Proteger `main` e criar pipeline mínimo obrigatório (SEC-07).
5. Confirmar no painel Supabase: cadastro público desabilitado se não necessário, senha mínima adequada, proteção contra credenciais vazadas, CAPTCHA/rate limit e MFA para papéis privilegiados.

### P2 — Hardening posterior

1. Rodar CSP em modo report-only, inventariar violações e só então bloquear.
2. Isolar parse de XLSX em Web Worker e limitar expansão (SEC-11).
3. Formalizar backup criptografado, retenção e restauração (SEC-12).
4. Adicionar logging estruturado e alertas para falhas repetidas de autenticação, 4xx/5xx anormais, criação excessiva de referências e tentativas de acesso negado, sem registrar tokens ou dados pessoais desnecessários.
5. Atualizar documentação que ainda cita Next.js 14/React 18/SheetJS para refletir a implementação atual.

## Testes de segurança recomendados

### Automatizados

- Testes de autorização RLS com usuários reais de teste por papel e região, cobrindo `SELECT`, `INSERT`, `UPDATE`, `DELETE`, RPC e Realtime.
- Testes negativos contra REST direto para provar que auditoria não pode ser contornada.
- Testes de transição de folha aberta/fechada e corrida entre dois operadores.
- Testes de aprovação e cálculo server-side, incluindo adulteração de payload.
- Route Handler: Bearer ausente/inválido, tipo incorreto, JSON malformado, objeto inválido, payload grande, duplicidade e erro interno genérico.
- CSV formula injection para `=`, `+`, `-`, `@`, espaços e caracteres de controle.
- Cabeçalhos HTTP no preview/deploy.
- Teste autenticado de papel para `/admin`, além do teste existente de redirecionamento.
- Testes de importação XLSX hostil e limites de recurso em worker.
- Teste de dependências e lockfile reproduzível com `npm ci`.

### Manuais

- Revisar a matriz de acesso com responsáveis de SP, MG/UBJP e MS.
- Tentar acessar objeto de outra região com conta de operador, tanto pela UI quanto pelo cliente REST.
- Confirmar cookies de sessão (`Secure`, `HttpOnly`, `SameSite`) no ambiente publicado e comportamento de expiração/revogação.
- Verificar configurações Supabase Auth que não estão no repositório: signup, política de senha, MFA, CAPTCHA, URLs de redirect e duração de sessão.
- Validar Realtime após endurecer RLS, pois eventos também respeitam políticas.
- Executar ZAP baseline no preview e exploração autenticada apenas em staging isolado.
- Testar restauração de backup fora da produção.

## CI/CD

- **SAST:** recomendado. CodeQL para JavaScript/TypeScript tem valor real nas Route Handlers, autenticação e manipulação de dados. Executar em PR e semanalmente; achados altos confirmados devem bloquear merge.
- **DAST:** útil somente com ambiente de staging/preview e dados descartáveis. ZAP baseline passivo pode rodar em preview; testes autenticados e ativos não devem apontar para produção.
- **Dependências:** recomendado `npm audit --omit=dev` no pipeline e Dependabot ou Renovate, mas não ambos. Bloquear vulnerabilidade alta/crítica sem correção ou aceite documentado; não falhar por todo alerta baixo transitório.
- **Segredos:** prioridade alta devido à `service_role`. Habilitar GitHub secret scanning/push protection quando disponível ou Gitleaks em PR. Nunca imprimir valores de `.env` nos logs.
- **Contêiner:** não recomendado agora, pois não existe imagem/container no projeto. Adicionar scanner sem artefato não gera valor.
- **SBOM:** P2. CycloneDX em releases é útil se houver requisito de cliente/compliance; não é gate prioritário nesta fase.
- **Security gates:** exigir `npm ci`, lint, testes, build, testes RLS e revisão de migração. Deploy de produção somente após aprovação e smoke test do preview. `supabase db lint` pode rodar contra ambiente efêmero; PR não deve receber credencial administrativa de produção.

## Mudanças realizadas

- Adicionados cabeçalhos `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`; removido `X-Powered-By`.
- Neutralizada interpretação de fórmulas na exportação CSV e adicionados testes unitários.
- Endurecidas as duas APIs: Bearer estrito, `application/json`, limite de 2 KiB, validação de tipo, respostas `no-store` e erros internos genéricos.
- Nenhuma política RLS, conta, dado de produção ou configuração externa foi alterada.

## Riscos residuais e próximos passos

Os riscos SEC-01 a SEC-07 permanecem. A prioridade técnica é desenhar a migração de mutações auditadas e cálculo/aprovação server-side em staging. Em paralelo, a prioridade operacional é concluir identidades individuais e matriz por região. Só depois desses critérios o sistema deve ser considerado pronto para dados de produção com exigência forte de rastreabilidade.
