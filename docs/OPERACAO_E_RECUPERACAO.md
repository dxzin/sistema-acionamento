# Operação, backup e recuperação

## Verificação antes de publicar

```powershell
npm run verify
npm run test:e2e
npx supabase db lint --linked
```

Os testes autenticados de navegador usam `E2E_EMAIL` e `E2E_PASSWORD`. Nunca grave essas credenciais no repositório.

## Backup manual do Supabase

Com o projeto vinculado pelo Supabase CLI:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-database.ps1
```

O comando cria duas cópias locais dentro de `backups/`: estrutura e dados da área `public`. A pasta é ignorada pelo Git porque contém informação operacional.

## Restauração

1. Crie um projeto Supabase separado para recuperação.
2. Restaure primeiro o arquivo `schema-*.sql` e depois `data-*.sql` usando uma conexão PostgreSQL administrativa.
3. Execute `npm run audit:data` apontando para o ambiente recuperado.
4. Confirme quantidades de escalas, folhas, despachos e histórico antes de alterar o endereço usado pelo sistema.

Nunca teste uma restauração diretamente no banco de produção. Uma restauração substitui dados e exige aprovação explícita do responsável operacional.

## Sinais de sincronização

- **Ao vivo:** WebSocket conectado; alterações aparecem imediatamente.
- **Sincronização de segurança:** rede bloqueou o canal ao vivo; o sistema verifica mudanças aproximadamente a cada 1,5 segundo.
- **Offline:** o computador está sem conexão; não continue preenchendo até a conexão retornar.
