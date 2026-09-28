-- Corrige os avisos do Security Advisor sem alterar dados existentes.
-- Esta migration deve ser revisada antes de qualquer aplicação fora do ambiente local.

-- Funções de trigger não precisam ser chamadas diretamente pelos clientes.
-- Um search_path vazio é seguro porque seus objetos já são qualificados ou
-- usam apenas funções do catálogo do PostgreSQL.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Funções SECURITY DEFINER acionadas exclusivamente por triggers.
REVOKE ALL ON FUNCTION public.apply_previous_abono() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.propagate_dispatch_continuity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_open_daily_sheet_from_schedule_entry() FROM PUBLIC, anon, authenticated;

-- Fechamento de folha continua disponível somente para usuários autenticados.
REVOKE ALL ON FUNCTION public.set_daily_sheet_status(UUID, public.sheet_status_enum) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_sheet_status(UUID, public.sheet_status_enum) TO authenticated;

-- RPCs usadas pelo cliente autenticado. SECURITY DEFINER é necessário para
-- a escrita da auditoria individual, mas chamadas anônimas não fazem parte do fluxo.
-- O lote e a presença funcionam corretamente com as políticas RLS do chamador.
ALTER FUNCTION public.update_dispatch_batch_with_audit(JSONB) SECURITY INVOKER;
ALTER FUNCTION public.touch_and_list_operator_presence(DATE, TEXT, UUID, TEXT, TEXT) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.update_dispatch_with_audit(UUID, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_dispatch_batch_with_audit(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_and_list_operator_presence(DATE, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_dispatch_with_audit(UUID, TIMESTAMPTZ, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_dispatch_batch_with_audit(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_and_list_operator_presence(DATE, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- Função auxiliar instalada por versões anteriores do projeto. Nem todos os
-- bancos locais possuem esse objeto, por isso a correção é condicional.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;

-- A tela já restringe alterações de escala a supervisores/administradores.
-- Remove as políticas posteriores que haviam reaberto a escrita para qualquer
-- usuário autenticado. As políticas originais por perfil permanecem ativas.
DROP POLICY IF EXISTS "Authenticated users can insert monthly schedules"
ON public.monthly_schedules;
DROP POLICY IF EXISTS "Authenticated users can update monthly schedules"
ON public.monthly_schedules;
DROP POLICY IF EXISTS "Authenticated users can insert monthly schedule entries"
ON public.monthly_schedule_entries;
DROP POLICY IF EXISTS "Authenticated users can update monthly schedule entries"
ON public.monthly_schedule_entries;
DROP POLICY IF EXISTS "Authenticated users can delete monthly schedule entries"
ON public.monthly_schedule_entries;
