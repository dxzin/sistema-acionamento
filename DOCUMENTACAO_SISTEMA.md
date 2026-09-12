# Documentação Técnica e Funcional do Sistema de Acionamento Logístico

> **Finalidade do Documento:** Este arquivo serve como contexto completo para desenvolvedores e assistentes de IA sobre a arquitetura, regras de negócio, banco de dados, design system e funcionalidades implementadas no projeto `sistema-acionamento`.

---

## 1. Visão Geral do Projeto

O **Sistema de Acionamento Logístico** é uma aplicação web corporativa desenvolvida para modernizar, substituir e automatizar o controle operacional anteriormente executado em planilhas Excel legadas (`TESTE.xlsx`), especificamente as operações de transporte e transbordo das bases de **São Paulo (SP - LP/Castilho)** e **Minas Gerais (MG - Uberaba/UB, Luz/LZ, João Pinheiro/JP)**.

### Principais Objetivos:
1. **Grade Operacional Diária em Tempo Real**: Despacho de motoristas, controle de entrada/saída, frota, destino, status operacional e controle de jornada/interjornada.
2. **Planejamento e Escala Mensal**: Edição inline interativa de escalas mensais (dias 1..31), importação e exportação de planilhas Excel/CSV.
3. **Cadastro e Gestão de Condutores**: Gestão cadastral de condutores por base, matrícula, turno padrão e horário de início.
4. **Trilha de Auditoria e Conformidade**: Registro de alterações operacionais, aprovação de abonos de horas e monitoramento de estouro de jornada CLT.
5. **Autenticidade Visual Excel**: Interface gráfica profissional fiel à identidade visual do Microsoft Excel clássico (verde corporativo, cabeçalhos fixos, células coloridas e alta densidade de informação).

---

## 2. Stack Tecnológica

- **Frontend & Framework:** Next.js 14 (App Router), React 18, TypeScript.
- **Estilização & UI:** Tailwind CSS, Lucide React (ícones vetoriais), CSS Variables (`globals.css`) calibradas com a paleta do Excel.
- **Manipulação de Planilhas:** SheetJS (`xlsx`) para parsing e geração de arquivos `.xlsx`/`.csv`.
- **Backend & Banco de Dados:** Supabase (PostgreSQL 15+, Row Level Security - RLS, Auth, Supabase Realtime).
- **Scripts de Migração e Automação:** Python 3.14 com `openpyxl` e `supabase-py`.

---

## 3. Modelo de Dados e Schema do Banco de Dados (Supabase / PostgreSQL)

### 3.1. Tabelas Principais

1. **`bases`**:
   - `id` (UUID, PK)
   - `code` (VARCHAR: `LP`, `CASTILHO`, `UB`, `LZ`, `JP`, `MS`)
   - `name` (VARCHAR: Nome descritivo da base)
   - `state` (VARCHAR: `SP`, `MG`, `MS`)
   - `is_active` (BOOLEAN)

2. **`locations`**:
   - `id` (UUID, PK)
   - `name` (VARCHAR: Destinos como `LP`, `UB`, `CASTILHO`, `LZ`, `JP`, etc.)
   - `is_active` (BOOLEAN)

3. **`drivers`**:
   - `id` (UUID, PK)
   - `name` (VARCHAR: Nome completo do motorista)
   - `login_matricula` (VARCHAR: Matrícula corporativa/login, ex: `MARCELO.LEANDRO`)
   - `base_id` (UUID, FK -> `bases.id`)
   - `default_shift` (VARCHAR: `A`, `B`, `C`)
   - `default_start_time` (TIME: `04:00:00`, `12:00:00`, `20:00:00`)
   - `is_active` (BOOLEAN: Ativo/Inativo)

4. **`monthly_schedules`**:
   - `id` (UUID, PK)
   - `month` (INTEGER: 1..12)
   - `year` (INTEGER: 2026, etc.)
   - `region` (VARCHAR: `SP`, `MG`, `MS`)
   - `status` (VARCHAR: `draft`, `published`, `archived`)

5. **`monthly_schedule_entries`**:
   - `id` (UUID, PK)
   - `schedule_id` (UUID, FK -> `monthly_schedules.id`)
   - `driver_id` (UUID, FK -> `drivers.id`)
   - `day_of_month` (INTEGER: 1..31)
   - `scale_code` (VARCHAR: `1`..`6` [dias de trabalho], `F`/`FE` [folga], `AT` [atestado], `AF` [afastamento], `DESL` [desligado])

6. **`daily_sheets`**:
   - `id` (UUID, PK)
   - `date` (DATE: `YYYY-MM-DD`)
   - `region` (VARCHAR: `SP`, `MG`)
   - `status` (VARCHAR: `open`, `closed`)

7. **`dispatches`**:
   - `id` (UUID, PK)
   - `sheet_id` (UUID, FK -> `daily_sheets.id`)
   - `driver_id` (UUID, FK -> `drivers.id`)
   - `entry_time` (TIME: Horário de início real da jornada)
   - `exit_time` (TIME: Horário de término da jornada)
   - `forecast_start_time` (TIME: Horário previsto para início)
   - `fleet_plate` (VARCHAR: Placa ou prefixo da frota - campo de digitação livre)
   - `trip_type` (VARCHAR: `C/V` - Carregado/Vazio)
   - `destination_location_id` (UUID, FK -> `locations.id`)
   - `final_destination_location_id` (UUID, FK -> `locations.id`)
   - `dispatch_status` (VARCHAR: `ACIONADO`, `ABONADO`, `APOIO`, `TROCA`, `FALTA`, `ATESTADO`, `AFASTADO`, `BATE E VOLTA`, `SUSPENSÃO`, `VIAGEM FECHADA`)
   - `cargo_status` (VARCHAR: `CARREGADO`, `VAZIO`)
   - `abono_reason` (TEXT: Motivo do abono)
   - `abono_authorized_by` (VARCHAR: Supervisor autorizador ou `PENDENTE`)
   - `observations` (TEXT)

8. **`audit_logs`**:
   - `id` (UUID, PK)
   - `timestamp` (TIMESTAMPTZ)
   - `user_id` (VARCHAR)
   - `action` (VARCHAR: Ex: `REGISTRO DE SAÍDA`, `AUTORIZAÇÃO DE ABONO`, etc.)
   - `old_values` (JSONB)
   - `new_values` (JSONB)

---

## 4. Dados Reais Migrados e Sincronizados

- **215 Condutores Reais** sincronizados com as planilhas de referência oficiais de Setembro/2026 para SP e MG.
- **8 Escalas Mensais Completas** (Junho a Setembro/2026 para SP e MG), contendo **26.170 registros de escala diária**.
- **185 Folhas Diárias e 12.126 Despachos Históricos** migrados para consultas e auditoria.
- **Fallback Automático:** Caso a conexão com o Supabase esteja temporariamente indisponível ou em desenvolvimento offline, o sistema alterna automaticamente para o modo de demonstração (`demo`) sem quebrar a aplicação.

---

## 5. Módulos do Sistema e Detalhamento Funcional

### 5.1. Acionamento Diário (`/acionamento`)
- **Grade Fixada e Responsiva:**
  - Coluna `#` (Índice da linha: `44px`, fixo na esquerda).
  - Coluna `CONDUTOR` (`230px`, fixa na esquerda com pesquisa instantânea integrada no cabeçalho).
  - Coluna `LOGIN` (`86px`, fixa na esquerda com botão de cópia de matrícula).
  - Colunas operacionais: `HORÁRIO`, `PREVISÃO`, `STATUS`, `MOTIVO DO ABONO`, `LOCAL`, `ENTRADA`, `FROTA`, `C/V`, `DESTINO`, `DESTINO FINAL`, `SAÍDA`, `FROTA SAÍDA`, `PREV. PRÓX.`, `TEMPO JORNADA`.
- **Campo FROTA Livre:**
  - O campo `FROTA` é de digitação direta na grade, sem dependência de tabelas complexas de cadastro de frota, gravando instantaneamente no banco.
- **Cálculo de Jornada e Interjornada:**
  - Cálculo contínuo do tempo de jornada com tolerância legal (11 horas CLT + 10 min tolerância = 670 minutos).
  - Tratamento da virada de meia-noite (24h) para jornadas noturnas.
  - Alerta visual em caso de jornadas pendentes de abono ou estouro de jornada.
- **Sincronização em Tempo Real (Supabase Realtime):**
  - Eventos de `INSERT`, `UPDATE` e `DELETE` na tabela `dispatches` atualizam a grade dos operadores conectados instantaneamente sem recarregar a página.

### 5.2. Escala Mensal (`/escala`)
- **Grade Interativa Mensal (Dias 1 a 31):**
  - Navegação por teclado com setas (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`).
  - Edição inline de códigos operacionais:
    - Trabalho: `1`, `2`, `3`, `4`, `5`, `6` (destaque verde suave `#E2F0D9` com texto `#0B5A30`).
    - Folga: `F`, `FE` (destaque vermelho/rosa suave `#FFD8D8` com texto `#9C0006`).
    - Atestado / Afastamento: `AT`, `AF`, `DESL` (destaque amarelo âmbar `#FFF2CC` com texto `#9C5700`).
    - Edição não salva (Dirty): destaque `#FFF8E1` com anel âmbar.
- **Importação e Exportação:**
  - Importação de arquivos `.xlsx` e `.csv` mapeando automaticamente condutores por nome e matrícula.
  - Exportação formatada para `.xlsx` preservando formatação e estilos de escala.
- **Filtros por Mês, Ano, Região (SP, MG, MS)** e busca por texto com debounce.

### 5.3. Cadastro e Gestão de Condutores (`/condutores`)
- **Tabela Operacional com Busca Integrada:**
  - Pesquisa rápida inline no cabeçalho `NOME COMPLETO` e na barra de ferramentas.
  - Colunas com larguras fixas (`<colgroup>`) sem cortes visuais para nomes ou horários.
  - Botão de cópia rápida para nome e matrícula.
- **Badges de Turno e Horário Padronizados:**
  - **Turno A (04:00):** Fundo amarelo suave (`#FFF2CC`), texto marrom âmbar (`#7F4B00`), borda `#FDE68A`.
  - **Turno B (12:00):** Fundo azul suave (`#DDEBF7`), texto azul petróleo (`#0369A1`), borda `#BAE6FD`.
  - **Turno C (20:00):** Fundo lilás suave (`#EDE7F6`), texto roxo escuro (`#5B2C6F`), borda `#DDD6FE`.
- **Modal de Cadastro / Edição:**
  - Auto-preenchimento do horário inicial padrão ao alternar o turno (A -> 04:00, B -> 12:00, C -> 20:00).
  - Inativação lógica com preservação do histórico de despachos passados.

### 5.4. Histórico e Trilha de Auditoria (`/historico`)
- Consulta cronológica de logs de auditoria com filtro por operador, ação e registro alterado.
- Monitoramento de ações sensíveis (aprovações de abono e alterações de horário).

### 5.5. Parâmetros e Administração (`/admin`)
- Visualização dos parâmetros de descanso regulamentar CLT (11h 10min).
- Listagem de bases operacionais cadastradas e locais de destino.

---

## 6. Design System e Identidade Visual (Excel Authentic)

A identidade visual foi construída para dar a sensação exata de trabalhar no Microsoft Excel, garantindo alta aceitação e produtividade imediata dos operadores:

| Elemento | Estilo / Código de Cor | Função / Aplicação |
| :--- | :--- | :--- |
| **Título Superior (`excel-titlebar`)** | `#107c41` (Excel Green) | Barra de título e status de conexão |
| **Cabeçalhos de Tabela (`thead`)** | `#107c41` com texto `#FFFFFF` | Cabeçalhos principais das colunas |
| **Número da Linha (`#`)** | `#ededed` com texto `#555555` | Numeração sequencial clássica do Excel |
| **Linhas Alternadas (`zebra`)** | `#ffffff` e `#fbfbfb` | Linhas da grade para leitura confortável |
| **Linha Selecionada / Hover** | `#e2f0d9` (Verde Claro Excel) | Realce da linha ativa sob o cursor |
| **Turno A / Horário 04h** | `#FFF2CC` (bg) / `#7F4B00` (texto) | Destaque do Turno Manhã |
| **Turno B / Horário 12h** | `#DDEBF7` (bg) / `#0369A1` (texto) | Destaque do Turno Tarde |
| **Turno C / Horário 20h** | `#EDE7F6` (bg) / `#5B2C6F` (texto) | Destaque do Turno Noite |
| **Status ACIONADO** | `#C6EFCE` (bg) / `#006100` (texto) | Viagem confirmada e liberada |
| **Status ABONADO** | `#FFC7CE` (bg) / `#9C0006` (texto) | Abono operacional de horas |
| **Status APOIO / TROCA** | `#FFEB9C` (bg) / `#9C5700` (texto) | Operação de apoio / troca de frota |
| **Status FALTA** | `#FF0000` (bg) / `#FFFFFF` (texto) | Ausência não justificada |

---

## 7. Estrutura de Diretórios do Projeto

```
sistema-acionamento/
├── src/
│   ├── app/
│   │   ├── acionamento/
│   │   │   └── page.tsx           # Tela principal de despacho diário
│   │   ├── escala/
│   │   │   └── page.tsx           # Planejamento de escala mensal 1..31
│   │   ├── condutores/
│   │   │   └── page.tsx           # Gestão cadastral de condutores
│   │   ├── historico/
│   │   │   └── page.tsx           # Trilha de auditoria operacional
│   │   ├── admin/
│   │   │   └── page.tsx           # Parâmetros e bases
│   │   ├── login/
│   │   │   └── page.tsx           # Tela de login e autenticação
│   │   ├── globals.css            # Variáveis de cor e classes do Excel theme
│   │   └── layout.tsx             # Layout raiz Next.js
│   ├── components/
│   │   ├── acionamento/
│   │   │   ├── DispatchGrid.tsx   # Grade interativa de despachos
│   │   │   ├── DispatchFilters.tsx# Barra de filtros operacionais
│   │   │   └── DispatchStatsBar.tsx# Barra de KPIs
│   │   └── layout/
│   │       ├── Header.tsx         # Barra superior estilo Excel
│   │       └── Sidebar.tsx        # Navegação lateral por abas
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts          # Cliente Supabase (Browser)
│   │   │   └── server.ts          # Cliente Supabase (SSR/Server)
│   │   ├── services/
│   │   │   ├── dispatch-service.ts# Regras de negócio de despacho
│   │   │   ├── schedule-service.ts# Regras de escala e SheetJS
│   │   │   └── driver-service.ts  # Regras de condutores
│   │   └── mock-data.ts           # Dados locais para modo offline/demo
│   └── types/
│       ├── database.ts            # Tipos de tabelas PostgreSQL
│       └── domain.ts              # Modelos de domínio da aplicação
├── scripts/
│   ├── sync_september_drivers.py  # Migração dos 215 condutores
│   ├── sync_monthly_schedules.py  # Migração das 8 escalas mensais
│   └── sync_daily_dispatches.py   # Migração dos 12.126 despachos
├── referencias/
│   └── TESTE.xlsx                 # Planilha Excel original de referência
├── package.json
└── tsconfig.json
```

---

## 8. Como Executar e Validar o Projeto

```bash
# Instalar dependências
npm install

# Executar ambiente de desenvolvimento (porta 3000)
npm run dev

# Executar linter
npm run lint

# Gerar build de produção otimizado
npm run build
```

---

## 9. Instruções para Próximas IAs e Desenvolvedores

1. **Sempre manter o Design System Excel**: Utilizar as classes `.excel-shell`, `.excel-workspace`, `.excel-toolbar`, `.excel-grid` e `.excel-schedule-grid`.
2. **Contraste de Texto:** Manter sempre texto escuro e legível (`text-slate-900 font-bold`) nas células brancas/claras.
3. **Colunas Fixas e `<colgroup>`:** Toda tabela que possui rolagem horizontal deve declarar `<colgroup>` com larguras explícitas em pixels para evitar quebra de alinhamento entre `thead` e `tbody`.
4. **Campo FROTA:** Tratar sempre como campo de digitação livre no despacho.
5. **Cores de Turno:** Respeitar rigorosamente a correspondência 04h (Amarelo `#FFF2CC`), 12h (Azul `#DDEBF7`) e 20h (Lilás `#EDE7F6`).