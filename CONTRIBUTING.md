# Contribuição

## Fluxo recomendado

1. Atualize a branch `main`.
2. Crie uma branch curta para a alteração.
3. Instale dependências com `npm ci`.
4. Faça mudanças pequenas e relacionadas ao mesmo objetivo.
5. Execute `npm run verify`.
6. Abra um pull request descrevendo impacto funcional, migrações e forma de validação.

## Regras do repositório

- Não registrar arquivos `.env`, credenciais, dados pessoais ou exportações do Supabase.
- Não registrar planilhas operacionais reais em `referencias/`.
- Não alterar migrações já aplicadas; crie uma nova migração.
- Mudanças em regras de jornada, continuidade ou acionamento devem incluir testes.
- Rotas que usam `SUPABASE_SERVICE_ROLE_KEY` devem validar autenticação e autorização antes de acessar dados.
- Alterações na ponte SIGhRA devem preservar o modo de teste local e a validação dos tokens.
- Não fazer push direto em `main` sem revisão quando o fluxo de pull request estiver disponível.

## Comandos

```bash
npm run lint
npm run test
npm run build
npm run verify
npm run test:e2e
```

## Commits

Prefira mensagens objetivas, por exemplo:

```text
feat: filtrar escala mensal por origem
fix: preservar destino final na continuidade
docs: atualizar instruções de implantação
```
