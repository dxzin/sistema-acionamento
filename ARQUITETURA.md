# Arquitetura do Sistema Web de Acionamento de Condutores

Este documento especifica a arquitetura técnica, modelo de dados relacional e motores de cálculo para a aplicação web de acionamento de condutores.

---

## 1. Visão Geral e Diretrizes de Engenharia

1. **Objetivo Central:** Substituir a planilha Excel por uma aplicação web multiusuário em tempo real, eliminando erros de fórmulas (`#REF!`), inconsistências e perda de dados.
2. **Requisitos de Experiência do Usuário (UX):**
   - **Grade Operacional Rápida (DataGrid):** Interface focada em produtividade para despachantes (navegação por `Tab`, `Enter`, setas, atalhos de teclado e preenchimento ágil).
   - **Cálculo Dinâmico em Tempo Real:** Atualização contínua do tempo trabalhado para condutores em jornada aberta.
3. **Integridade e Confiabilidade:**
   - Banco de dados relacional com integridade referencial estrita e transações ACID.
   - Histórico e trilha de auditoria para registros de despacho.

---

## 2. Modelo de Dados Relacional (PostgreSQL)

```
+---------------------------------------------------------------------------------------------------+
|                                      DIAGRAMA ER SIMPLIFICADO                                     |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Bases] 1-------* [Drivers] 1-------* [MonthlyScheduleEntries] *-------1 [MonthlySchedules]      |
|     |                 |                                                                           |
|     |                 +-------------+                                                             |
|     |                               |                                                             |
|     +-------* [DailySheets] 1-------* [Dispatches]                                                |
|                   |                      |                                                        |
|                   *                      +-------* [Vehicles / Fleets]                            |
|              [AuditLogs]                 +-------* [Locations]                                    |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### 2.1. Estrutura das Tabelas Principais

#### `bases` (Cidades / Locais de Lotação)
- `id` (UUID, PK)
- `code` (VARCHAR(10), UNIQUE, NOT NULL) — Ex.: `LP`, `UB`, `LZ`, `JP`, `CASTILHO`, `MS`
- `name` (VARCHAR(100), NOT NULL)
- `is_active` (BOOLEAN, DEFAULT TRUE)

#### `drivers` (Condutores / Colaboradores)
- `id` (UUID, PK)
- `name` (VARCHAR(150), NOT NULL)
- `login_matricula` (VARCHAR(30), UNIQUE, NOT NULL)
- `base_id` (UUID, FK -> `bases.id`, NOT NULL)
- `default_shift` (VARCHAR(10)) — `A`, `B`, `C`
- `default_start_time` (TIME) — `04:00:00`, `12:00:00`, `20:00:00`
- `is_active` (BOOLEAN, DEFAULT TRUE)
- `created_at` (TIMESTAMPTZ, DEFAULT NOW())

#### `vehicles` (Frotas / Veículos)
- `id` (UUID, PK)
- `plate_code` (VARCHAR(20), UNIQUE, NOT NULL) — Ex.: `SJE7G29`, `PZB0F50`
- `vehicle_type` (VARCHAR(50), DEFAULT 'CAVALO_MECANICO')
- `is_active` (BOOLEAN, DEFAULT TRUE)

#### `locations` (Destinos e Pontos Operacionais)
- `id` (UUID, PK)
- `name` (VARCHAR(100), UNIQUE, NOT NULL) — Ex.: `UBERABA`, `LP`, `CASTILHO`, `LUIZLANDIA`, `POSTO CAXUXA`
- `region` (VARCHAR(50))
- `is_active` (BOOLEAN, DEFAULT TRUE)

#### `monthly_schedules` (Cabeçalho da Escala Mensal)
- `id` (UUID, PK)
- `month` (INT, NOT NULL) — 1 a 12
- `year` (INT, NOT NULL) — Ex.: 2026
- `region` (VARCHAR(20), NOT NULL) — `SP`, `MG`, `MS`, `UBJP`
- `status` (VARCHAR(20), DEFAULT 'ACTIVE')
- `UNIQUE(month, year, region)`

#### `monthly_schedule_entries` (Registros Diários da Escala)
- `id` (UUID, PK)
- `schedule_id` (UUID, FK -> `monthly_schedules.id`, NOT NULL)
- `driver_id` (UUID, FK -> `drivers.id`, NOT NULL)
- `day_of_month` (INT, NOT NULL) — 1 a 31
- `scale_code` (VARCHAR(30), NOT NULL) — `1`, `2`, `3`, `4`, `5`, `6`, `F`, `FE`, `FER`, `AF`, `AT`, `DESL`
- `shift_letter` (VARCHAR(10))
- `shift_time` (TIME)
- `notes` (TEXT)
- `UNIQUE(schedule_id, driver_id, day_of_month)`

#### `daily_sheets` (Folha Diária de Despacho)
- `id` (UUID, PK)
- `date` (DATE, NOT NULL)
- `region` (VARCHAR(20), NOT NULL) — `SP` ou `UBJP`
- `status` (VARCHAR(20), DEFAULT 'OPEN') — `OPEN`, `CLOSED`
- `created_by` (UUID, FK -> `users.id`)
- `created_at` (TIMESTAMPTZ, DEFAULT NOW())
- `UNIQUE(date, region)`

#### `dispatches` (Acionamentos Diários)
- `id` (UUID, PK)
- `daily_sheet_id` (UUID, FK -> `daily_sheets.id`, NOT NULL)
- `driver_id` (UUID, FK -> `drivers.id`, NOT NULL)
- `previous_dispatch_id` (UUID, FK -> `dispatches.id`)
- `forecast_start_time` (TIME) — Previsão herdada de D-1 ou digitada
- `dispatch_status` (VARCHAR(30), NOT NULL, DEFAULT 'ACIONADO') — `ACIONADO`, `ABONADO`, `APOIO`, `TROCA`, `FALTA`, `ATESTADO`, `AFASTADO`, `BATE E VOLTA`, `SUSPENSÃO`, `VIAGEM FECHADA`
- `abono_reason` (TEXT) — Motivo do abono / ocorrência
- `abono_authorized_by` (VARCHAR(50)) — Responsável pela autorização (`ANDERSON`, `ROBERTO`, `LEOVEGILDO`, `PENDENTE`)
- `origin_location_id` (UUID, FK -> `locations.id`) — Local de partida herdado de D-1 ou informado
- `entry_time` (TIME) — Horário de entrada
- `vehicle_id` (UUID, FK -> `vehicles.id`) — Frota utilizada
- `cargo_status` (VARCHAR(5)) — `C` (Carregado) ou `V` (Vazio)
- `destination_location_id` (UUID, FK -> `locations.id`) — Destino intermediário
- `final_destination_location_id` (UUID, FK -> `locations.id`) — Destino final
- `exit_time` (TIME) — Horário de saída
- `observations` (TEXT) — Anotações de campo
- `scale_day_status` (VARCHAR(30)) — Código da escala mensal do dia
- `next_day_forecast_time` (TIME) — Próxima previsão calculada (Saída + Interjornada)
- `total_worked_minutes` (INT) — Duração total calculada da jornada
- `created_at` (TIMESTAMPTZ, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW())
- `UNIQUE(daily_sheet_id, driver_id)`

#### `audit_logs` (Auditoria)
- `id` (UUID, PK)
- `user_id` (UUID, FK -> `users.id`)
- `entity_name` (VARCHAR(50), NOT NULL)
- `entity_id` (UUID, NOT NULL)
- `action` (VARCHAR(20), NOT NULL)
- `old_values` (JSONB)
- `new_values` (JSONB)
- `timestamp` (TIMESTAMPTZ, DEFAULT NOW())

---

## 3. Motores de Regras e Serviços de Cálculo

### 3.1. `JornadaCalculationService`
Calcula o tempo de jornada com suporte a virada de meia-noite e tempo real:
```typescript
interface JornadaInput {
  entryTime: string | null; // "HH:mm:ss"
  exitTime: string | null;  // "HH:mm:ss"
  referenceNow?: string;    // "HH:mm:ss"
}

function calculateJornada(input: JornadaInput): number | null {
  if (!input.entryTime) return null;
  
  const entryMinutes = timeToMinutes(input.entryTime);
  
  if (!input.exitTime) {
    // Jornada em andamento (tempo real)
    const nowMinutes = timeToMinutes(input.referenceNow || getCurrentTime());
    return nowMinutes >= entryMinutes 
      ? nowMinutes - entryMinutes 
      : (1440 - entryMinutes) + nowMinutes;
  }
  
  const exitMinutes = timeToMinutes(input.exitTime);
  return exitMinutes >= entryMinutes 
    ? exitMinutes - entryMinutes 
    : (1440 - entryMinutes) + exitMinutes;
}
```

### 3.2. `InterjornadaService`
Calcula a próxima previsão de acionamento:
```typescript
function calculateNextForecast(exitTime: string | null, interjornadaMinutes: number = 670): string | null {
  if (!exitTime) return null;
  
  const exitMinutes = timeToMinutes(exitTime);
  const nextForecastMinutes = (exitMinutes + interjornadaMinutes) % 1440;
  
  return minutesToTime(nextForecastMinutes);
}
```

### 3.3. `ContinuityEngine` (Herança Diária)
Ao inicializar o dia D para uma região:
1. Recupera o dia D-1 da mesma região.
2. Para cada condutor ativo:
   - Se houver `next_day_forecast_time` em D-1 $\rightarrow$ define como `forecast_start_time` de D.
   - Se houver `final_destination_location_id` em D-1 $\rightarrow$ define como `origin_location_id` de D.
   - Resoluções de escala mensal (código do dia, login e horário padrão) são vinculadas automaticamente.

---

## 4. Arquitetura da Aplicação Web e Stack Tecnológica

- **Frontend:** Next.js / React (TypeScript), TanStack DataGrid virtualizado para máxima velocidade de digitação e navegação por teclado, Tailwind CSS.
- **Backend:** Node.js (Fastify / NestJS) ou Python (FastAPI), Prisma / Drizzle ORM, validação Zod.
- **Banco de Dados:** PostgreSQL 16+.
- **Sincronização em Tempo Real:** WebSockets para atualização simultânea entre despachantes.
