# Roadmap de Desenvolvimento e Transição Operacional

Este documento estabelece o plano de implementação para o desenvolvimento do sistema web de acionamento de condutores, substituindo a planilha Excel (`TESTE.xlsx`).

---

## 1. Visão Geral das Fases

```
+--------------------------------------------------------------------------------------------------------------------+
|                                              FASES DO PROJETO                                                      |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
| [Fase 0: Especificação] -> [Fase 1: Setup & Grade Base] -> [Fase 2: Escalas & Sync] -> [Fase 3: Motor Avançado]   |
|                                                                                             |                      |
| [Descontinuação Excel] <- [Fase 6: Go-Live] <- [Fase 5: Operação em Paralelo] <- [Fase 4: Abonos & Relatórios]    |
|                                                                                                                    |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Detalhamento das Fases

### Fase 0: Mapeamento e Engenharia Reversa (CONCLUÍDA)
- [x] Extração e análise profunda das 198 abas da planilha `TESTE.xlsx`.
- [x] Mapeamento de fórmulas, dependências entre dias e parâmetros de `REFERÊNCIAS`.
- [x] Formalização do cálculo de jornada (diurna, noturna com virada de meia-noite, tempo real).
- [x] Formalização do cálculo de interjornada e previsão de próximo dia.
- [x] Criação de `MAPEAMENTO_EXCEL.md`, `REGRAS_NEGOCIO.md`, `ARQUITETURA.md` e `ROADMAP.md`.

---

### Fase 1: Setup do Ambiente, Infraestrutura, Banco de Dados e Grade Inicial (CONCLUÍDA)
**Objetivo:** Estabelecer a base técnica, modelo relacional com RLS, autenticação e grade operacional de acionamento.
- [x] Inicialização do projeto Next.js 14 com TypeScript, App Router e Tailwind CSS.
- [x] Definição do modelo de dados relacional completo:
  - `bases` (Unidades operacionais e tempo de interjornada)
  - `profiles` (Usuários integrados ao Supabase Auth com roles `admin`, `supervisor`, `operator`)
  - `drivers` (Condutores com matrícula, turno padrão e base)
  - `vehicles` (referência interna criada ao digitar a frota no acionamento)
  - `locations` (Destinos e pontos operacionais)
  - `operational_params` (Parâmetros globais)
  - `monthly_schedules` e `monthly_schedule_entries` (Escalas mensais por condutor e dia 1..31)
  - `daily_sheets` e `dispatches` (Folhas diárias e despachos individuais)
  - `audit_logs` (Trilha de auditoria e histórico de alterações)
- [x] Criação do script de migration SQL para Supabase (`supabase/migrations/20260910000000_initial_schema.sql`):
  - Row Level Security (RLS) habilitado e configurado em 100% das tabelas.
  - Triggers automáticos para atualização de `updated_at`.
  - Trigger `handle_new_user()` para criação de perfil ao cadastrar no Supabase Auth.
  - Índices de performance para buscas rápidas.
  - Carga inicial (seeds) de bases e destinos operacionais.
- [x] Estrutura de autenticação (`AuthContext`, roles, helpers de cliente/servidor/middleware Supabase).
- [x] Criação da estrutura base de rotas:
  - `/login`: Autenticação e alternância de perfil
  - `/acionamento`: Tela principal de acionamento operacional
  - `/escala`: Visualização da grade mensal de escala
  - `/condutores`: Listagem e controle de motoristas
  - `/historico`: Histórico de auditoria e despachos
  - `/admin`: Painel de parâmetros operacionais
- [x] Tela Principal de ACIONAMENTO (Grade estilo planilha):
  - 17 colunas operacionais conforme a planilha: `CONDUTOR`, `LOGIN`, `HORÁRIO`, `PREVISÃO`, `ACIONADO/STATUS`, `MOTIVO DO ABONO`, `LOCAL`, `ENTRADA`, `FROTA`, `C/V`, `DESTINO`, `DESTINO FINAL`, `SAÍDA`, `OBSERVAÇÃO`, `DIA DE ESCALA`, `PREV. PRÓX.`, `TEMPO DE JORNADA`.
  - Cabeçalho fixo (`sticky header`) e colunas de identificação fixas à esquerda.
  - Rolagem horizontal fluida e linhas compactas de alta densidade visual.
  - Edição inline rápida com recalculo reativo.
  - Filtros: busca por condutor/login, data, operação/região (SP / UBJP), status de acionamento e turno (A / B / C).
  - Cópia rápida de células com 1 clique (com feedback visual).
  - Ordenação dinâmica por colunas.
  - Badges com cores operacionais conforme o status (`ACIONADO`, `ABONADO`, `APOIO`, `TROCA`, `FALTA`, `ATESTADO`, etc.).
  - Barra superior de KPIs operacionais (Total, Acionados, Em Trânsito, Abonados, Apoios, Trocas, Faltas, Pendências).
  - Motores de cálculo integrados:
    - `calculateJornada`: cálculo diurno, noturno (virada de 24h) e em andamento (relógio em tempo real).
    - `calculateNextForecast`: cálculo de interjornada (11h10min = 670 minutos).
    - `resolveDayContinuity`: herança de previsão e local de D-1 para D.

---

### Fase 2: Gestão Cadastral e Módulo de Escalas Mensais
**Objetivo:** Permitir o cadastro de motoristas, veículos e importação/gestão das escalas mensais.
- [x] Cadastro e gestão de condutores com edição completa de turno e base.
- [x] Digitação livre da frota diretamente no acionamento, sem cadastro prévio.
- [x] Editor interativo de Escala Mensal (grade 1 a 31 com atalhos de teclado).
- [ ] Importador de escalas mensais (Excel/CSV) com validação de duplicidade e mapeamento automático de códigos (`1` a `6`, `F`, `FE`, `AT`, `AF`, `DESL`).
- [ ] Resolução automática em lote de turno, horário e código do dia para os despachos diários.

---

### Fase 3: Motor de Continuidade Avançado e Sincronização em Tempo Real
**Objetivo:** Automação de geração de novas folhas diárias e sincronização multiusuário.
- [ ] Geração automática de folha diária para o dia seguinte (D+1) aplicando herança de `PREVISÃO` e `LOCAL`.
- [ ] Sincronização em tempo real via Supabase Realtime para múltiplos despachantes simultâneos.
- [ ] Tratamento de concorrência com bloqueio otimista de linha durante edição.

---

### Fase 4: Gestão de Abonos, Alertas e Relatórios Gerenciais
**Objetivo:** Gestão de ocorrências e relatórios operacionais.
- [ ] Fluxo de aprovação de abonos com assinatura de supervisores (`ANDERSON`, `ROBERTO`, `LEOVEGILDO`).
- [ ] Destaque visual de pendências para acionamentos marcados com `PENDENTE`.
- [ ] Relatórios operacionais consolidados:
  - Horas trabalhadas por condutor e período.
  - Relatório de motivos de abono e faltas.
  - Histórico de viagens e rotas por motorista.
- [ ] Trilha de auditoria detalhada com `diff` de valores alterados.

---

### Fase 5: Importação Histórica e Operação em Paralelo (*Shadow Run*)
**Objetivo:** Validar a precisão dos cálculos e a aceitação dos despachantes em ambiente real.
- [ ] Script de importação dos dados históricos do Excel `TESTE.xlsx`.
- [ ] Testes de concordância matemática entre os cálculos web e o histórico do Excel.
- [ ] Operação em paralelo (1 a 2 semanas) com os despachantes para homologação prática.
- [ ] Ajustes finos de atalhos e usabilidade com base no feedback dos operadores.

---

### Fase 6: Go-Live, Treinamento e Desativação do Excel
**Objetivo:** Transição oficial para a aplicação web.
- [ ] Treinamento dos despachantes e gestores.
- [ ] Bloqueio de edição da planilha Excel legada (mantida apenas para consulta histórica).
- [ ] Acompanhamento assistido durante os primeiros dias de operação exclusiva.
- [ ] Transição para suporte contínuo.
