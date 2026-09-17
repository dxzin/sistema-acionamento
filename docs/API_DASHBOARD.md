# Consulta de escala para dashboard

Endpoint somente de leitura: `GET /api/v1/escala` no domínio do sistema.
Retorna os dados reais do Supabase; não usa dados de demonstração.

## Configuração

Configure no servidor `DASHBOARD_API_TOKEN` com uma credencial aleatória exclusiva
(pelo menos 32 bytes). Também são necessários `NEXT_PUBLIC_SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY`, já usados no sistema. Reinicie ou publique a aplicação
após configurar. A chave de serviço do Supabase nunca deve ser entregue ao gestor.

O dashboard envia `Authorization: Bearer SUA_CREDENCIAL` em cada consulta HTTPS.
Guarde essa credencial no servidor/conector do dashboard, não em JavaScript público.
Para revogar ou trocar o acesso, altere `DASHBOARD_API_TOKEN` no servidor.
Essa credencial permite consultar todas as bases; o filtro de base não limita a permissão.

```sh
curl "https://SEU-DOMINIO/api/v1/escala?data=2026-09-16&matricula=123" \
  -H "Authorization: Bearer SUA_CREDENCIAL"
```

## Filtros

| Parâmetro | Uso |
| --- | --- |
| `data` | Dia em YYYY-MM-DD. Sem datas, usa hoje em Brasília. |
| `inicio`, `fim` | Alternativa a data, ambos obrigatórios, até 31 dias inclusive. |
| `matricula` | Matrícula exata do condutor. |
| `base` | Código da base, por exemplo LP, CASTILHO ou UB. |
| `pagina` | Página de condutores, começa em 1. |
| `limite` | Condutores por página: padrão 50, máximo 100. |

A paginação é por condutores, não por dias. Consulte `paginacao.proxima_pagina`
até receber null. Cada página pode conter até 31 dias por condutor e entradas em
mais de uma região. Condutores sem escala no período não geram linhas. Histórico
de condutores inativos também pode aparecer. Acionamentos sem entrada na escala
mensal não são retornados. Ausência de linhas não significa folga.

## Resposta

O objeto contém `versao`, `consultado_em`, `fuso_horario`, `periodo`, `paginacao`
e `dados`. Cada linha em `dados` contém:

- `data`, `regiao`, `condutor` (id, nome e matricula), `base`, `escala`, `turno`.
- `horario_escala`: horário cadastrado, podendo ser VF; não é entrada real.
- `inicio_previsto`: previsão registrada no acionamento.
- `inicio_jornada`, `fim_jornada`: valores registrados; entrada pode conter sequência
  como 1° quando ainda não existe horário real.
- `situacao_acionamento`, `origem`, `destino`, `destino_final`.
- `motivo_abono`: motivo registrado, incluindo “Abonado ontem” para controle de D-1.
- `disponibilidade_prevista_apos_descanso`: instante ISO 8601 em UTC calculado com
  entrada e saída reais e descanso configurado na base; considera a virada da meia-noite.
  É uma previsão após descanso, não confirmação de que o condutor está disponível
  (pode estar de folga, afastado ou ter outro acionamento).
- `previsao_proximo_dia`: horário registrado para o próximo dia, podendo ter ajuste manual.
- `atualizado_em`: atualização mais recente entre escala e acionamento.

Informações não registradas retornam null. Horários de jornada são locais em Brasília;
instantes com Z estão em UTC e devem ser convertidos para exibição.
As consultas não usam cache. A resposta não é um snapshot transacional: alterações
simultâneas podem aparecer entre páginas. Atualização a cada 1–5 minutos é uma opção
de configuração do dashboard. A conexão prevista é pelo servidor/conector; acesso
direto de outro domínio no navegador não tem CORS habilitado.

Erros em JSON: 400 (filtros inválidos), 401 (credencial ausente/incorreta),
503 (configuração ausente), 500 (falha na consulta). Outros métodos retornam 405.
