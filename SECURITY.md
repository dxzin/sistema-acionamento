# Segurança

## Informações sigilosas

Nunca registre no GitHub:

- `SUPABASE_SERVICE_ROLE_KEY`;
- senhas, URLs privadas ou credenciais do banco SIGhRA;
- `SIGHRA_BRIDGE_TOKEN`, `SIGHRA_NOTEBOOK_BRIDGE_TOKEN` ou tokens locais;
- tokens de dashboards, sessões, cookies ou credenciais de usuários;
- arquivos `.env`, backups ou exportações com dados operacionais.

Use `.env.example` somente como catálogo de nomes. Valores reais devem permanecer no gerenciador de segredos da Vercel ou no ambiente seguro do servidor.

## Comunicação de vulnerabilidades

Não abra uma issue pública contendo credenciais, dados pessoais ou detalhes que permitam explorar o ambiente. Informe o responsável técnico pelo canal interno da empresa e inclua:

- resumo do problema;
- ambiente afetado;
- passos mínimos para reprodução;
- impacto observado;
- evidências sem dados pessoais ou segredos.

Se houver suspeita de exposição, revogue ou rotacione primeiro a credencial afetada e depois investigue os logs.

## Controles existentes

- autenticação pelo Supabase Auth;
- políticas de Row Level Security;
- autorização adicional nas rotas administrativas;
- trilha de auditoria para alterações operacionais;
- tokens independentes para as pontes SIGhRA;
- validação de origem e limites de payload nas APIs sensíveis.
