# Prova de conceito na Cloudflare

Esta configuração publica a mesma aplicação em Cloudflare Workers com `vinext`.
A publicação atual da Vercel continua disponível durante a avaliação.

## Requisitos

- Node.js 22.23 ou 24.22, no mínimo para a ferramenta `cf` atual;
- conta Cloudflare com Workers Paid;
- variáveis equivalentes às usadas no ambiente atual.

## Validação local

```powershell
npm ci
npm run build:vinext
npm run start:vinext
```

O preview local abre em `http://localhost:4173`. O Next.js original continua
disponível com `npm run dev`, `npm run build` e `npm run start`.

Antes de publicar, valide a configuração sem alterar a conta Cloudflare:

```powershell
npm run deploy:vinext -- --dry-run
```

## Primeira publicação

Autentique a ferramenta no diretório do projeto:

```powershell
npx cf auth login
```

Depois publique o Worker de teste:

```powershell
npm run deploy:vinext
```

O Worker usa o nome `sistema-acionamento`. Mantenha o domínio de produção na
Vercel durante a prova. Use primeiro o endereço `workers.dev` fornecido pela
Cloudflare.

## Variáveis

Cadastre no Worker as mesmas variáveis do ambiente autorizado. Nunca copie
valores para arquivos versionados. As variáveis essenciais são:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Os fluxos correspondentes também exigem `DASHBOARD_API_TOKEN` e as variáveis
`SIGHRA_*` listadas em `.env.example`. Cadastre chaves de serviço e tokens como
secrets no painel da Cloudflare.

## Roteiro de homologação

1. Abrir `/login` e autenticar com uma conta de teste.
2. Consultar a escala e uma folha diária.
3. Editar um registro controlado e confirmar a auditoria.
4. Abrir duas sessões e confirmar o Realtime.
5. Importar e exportar uma planilha `.xlsx` dentro dos limites do sistema.
6. Validar as rotas administrativas somente com usuário autorizado.
7. Apontar uma ponte SIGhRA de teste somente após os passos anteriores.
8. Acompanhar CPU, erros e requisições no painel Workers por alguns dias.

Não altere o domínio principal nem a URL da ponte de produção antes da
homologação completa.
