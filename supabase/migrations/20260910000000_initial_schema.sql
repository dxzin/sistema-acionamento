-- =============================================================================
-- SISTEMA DE ACIONAMENTO DE CONDUTORES - SCHEMA INICIAL
-- Migração Supabase / PostgreSQL com RLS, Triggers e Índices de Performance
-- =============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TIPOS CUSTOMIZADOS (ENUMS)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'operator');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE dispatch_status_enum AS ENUM (
        'ACIONADO',
        'ABONADO',
        'APOIO',
        'TROCA',
        'FALTA',
        'ATESTADO',
        'AFASTADO',
        'BATE E VOLTA',
        'SUSPENSÃO',
        'VIAGEM FECHADA'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE cargo_status_enum AS ENUM ('C', 'V');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sheet_status_enum AS ENUM ('OPEN', 'LOCKED', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. FUNÇÃO AUXILIAR PARA ATUALIZAÇÃO DE TIMESTAMPS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. TABELAS PRINCIPAIS

-- 4.1. BASES / UNIDADES OPERACIONAIS
CREATE TABLE IF NOT EXISTS public.bases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    interjornada_minutes INT NOT NULL DEFAULT 670, -- 11h10min
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2. PERFIS DE USUÁRIO (Vinculados a auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    role user_role NOT NULL DEFAULT 'operator',
    base_id UUID REFERENCES public.bases(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trigger_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.3. CONDUTORES / MOTORISTAS
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    login_matricula VARCHAR(30) UNIQUE NOT NULL,
    base_id UUID NOT NULL REFERENCES public.bases(id) ON DELETE RESTRICT,
    default_shift VARCHAR(10) DEFAULT 'B',
    default_start_time TIME DEFAULT '12:00:00',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trigger_drivers_updated_at
BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.4. VEÍCULOS / FROTAS
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate_code VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL DEFAULT 'CAVALO_MECANICO',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.5. LOCAIS / DESTINOS OPERACIONAIS
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    region VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.6. PARÂMETROS OPERACIONAIS GLOBAIS
CREATE TABLE IF NOT EXISTS public.operational_params (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(50) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.7. ESCALAS MENSAIS (CABEÇALHO)
CREATE TABLE IF NOT EXISTS public.monthly_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INT NOT NULL CHECK (year >= 2020),
    region VARCHAR(20) NOT NULL, -- 'SP', 'MG', 'MS', 'UBJP'
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (month, year, region)
);

CREATE TRIGGER trigger_monthly_schedules_updated_at
BEFORE UPDATE ON public.monthly_schedules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.8. REGISTROS DIÁRIOS DA ESCALA MENSAL
CREATE TABLE IF NOT EXISTS public.monthly_schedule_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES public.monthly_schedules(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    day_of_month INT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    scale_code VARCHAR(30) NOT NULL, -- '1'..'6', 'F', 'FE', 'AT', 'AF', 'DESL', etc.
    shift_letter VARCHAR(10),
    shift_time TIME,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (schedule_id, driver_id, day_of_month)
);

-- 4.9. FOLHAS DIÁRIAS DE ACIONAMENTO
CREATE TABLE IF NOT EXISTS public.daily_sheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    region VARCHAR(20) NOT NULL, -- 'SP' ou 'UBJP'
    status sheet_status_enum NOT NULL DEFAULT 'OPEN',
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (date, region)
);

CREATE TRIGGER trigger_daily_sheets_updated_at
BEFORE UPDATE ON public.daily_sheets
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.10. DESPACHOS / ACIONAMENTOS INDIVIDUAIS
CREATE TABLE IF NOT EXISTS public.dispatches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    daily_sheet_id UUID NOT NULL REFERENCES public.daily_sheets(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    previous_dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE SET NULL,
    forecast_start_time TIME,
    dispatch_status dispatch_status_enum NOT NULL DEFAULT 'ACIONADO',
    abono_reason TEXT,
    abono_authorized_by VARCHAR(50),
    origin_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    entry_time TIME,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    cargo_status cargo_status_enum,
    destination_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    final_destination_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    exit_time TIME,
    observations TEXT,
    scale_day_status VARCHAR(30),
    next_day_forecast_time TIME,
    total_worked_minutes INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (daily_sheet_id, driver_id)
);

CREATE TRIGGER trigger_dispatches_updated_at
BEFORE UPDATE ON public.dispatches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.11. TRILHA DE AUDITORIA
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    entity_name VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
    old_values JSONB,
    new_values JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. ÍNDICES PARA ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_dispatches_sheet ON public.dispatches(daily_sheet_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_driver ON public.dispatches(driver_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON public.dispatches(dispatch_status);
CREATE INDEX IF NOT EXISTS idx_daily_sheets_date ON public.daily_sheets(date, region);
CREATE INDEX IF NOT EXISTS idx_monthly_entries_lookup ON public.monthly_schedule_entries(schedule_id, driver_id, day_of_month);
CREATE INDEX IF NOT EXISTS idx_drivers_login ON public.drivers(login_matricula);
CREATE INDEX IF NOT EXISTS idx_drivers_base ON public.drivers(base_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON public.vehicles(plate_code);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_name, entity_id);

-- 6. TRIGGER DE CRIAÇÃO AUTOMÁTICA DE PERFIL NO CADASTRO DO SUPABASE AUTH
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        'operator'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, name = EXCLUDED.name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. SEGURANÇA POR LINHA (ROW LEVEL SECURITY - RLS)
ALTER TABLE public.bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 7.1. POLÍTICAS DE RLS PARA LEITURA (Usuários Autenticados)
CREATE POLICY "Allow authenticated read on bases" ON public.bases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on drivers" ON public.drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on vehicles" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on locations" ON public.locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on operational_params" ON public.operational_params FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on monthly_schedules" ON public.monthly_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on monthly_schedule_entries" ON public.monthly_schedule_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on daily_sheets" ON public.daily_sheets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on dispatches" ON public.dispatches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);

-- 7.2. POLÍTICAS DE RLS PARA ESCRITA OPERACIONAL
CREATE POLICY "Allow authenticated insert/update on daily_sheets" ON public.daily_sheets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated insert/update on dispatches" ON public.dispatches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated insert on audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update on own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 7.3. POLÍTICAS DE RLS PARA ADMINISTRAÇÃO E SUPERVISÃO (Bases, Condutores, Frotas, Escalas)
CREATE POLICY "Allow supervisor/admin modify on drivers" ON public.drivers FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')));

CREATE POLICY "Allow supervisor/admin modify on vehicles" ON public.vehicles FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')));

CREATE POLICY "Allow supervisor/admin modify on locations" ON public.locations FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')));

CREATE POLICY "Allow supervisor/admin modify on monthly_schedules" ON public.monthly_schedules FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')));

CREATE POLICY "Allow supervisor/admin modify on monthly_schedule_entries" ON public.monthly_schedule_entries FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'supervisor')));

-- 8. DADOS INICIAIS (SEEDS)

-- 8.1. BASES
INSERT INTO public.bases (code, name, interjornada_minutes) VALUES
('LP', 'Lençóis Paulista - SP', 670),
('UB', 'Uberaba - MG', 670),
('LZ', 'Luizlândia do Oeste - MG', 670),
('JP', 'João Pinheiro - MG', 670),
('CASTILHO', 'Castilho - SP', 670),
('MS', 'Mato Grosso do Sul', 670)
ON CONFLICT (code) DO NOTHING;

-- 8.2. LOCAIS E DESTINOS
INSERT INTO public.locations (name, region) VALUES
('LP', 'SP'),
('UBERABA', 'MG'),
('CASTILHO', 'SP'),
('LUIZLANDIA', 'MG'),
('BREJO BONITO', 'MG'),
('POSTO CAXUXA', 'MG'),
('LUZ', 'MG'),
('ZELÂNDIA', 'MG'),
('ARAXÁ', 'MG'),
('JP', 'MG'),
('CHAPADÃO A', 'MS'),
('SANTA IZA / UBERABA', 'MG'),
('TROCA NO MEL', 'MG'),
('TROCA NO 034', 'MG'),
('VARJÃO DE MINAS', 'MG'),
('PATOS DE MINAS', 'MG'),
('RIBEIRÃO PRETO', 'SP')
ON CONFLICT (name) DO NOTHING;

-- 8.3. PARÂMETROS OPERACIONAIS
INSERT INTO public.operational_params (key, value, description) VALUES
('interjornada_padrao_minutos', '670'::jsonb, 'Tempo padrão de descanso entre jornadas (11h10min)'),
('tolerancia_entrada_minutos', '15'::jsonb, 'Tolerância padrão para registro de início de turno'),
('aprovadores_abono_permitidos', '["ANDERSON", "ROBERTO", "LEOVEGILDO", "PENDENTE"]'::jsonb, 'Lista de aprovadores autorizados para justificativa de abono')
ON CONFLICT (key) DO NOTHING;
