-- A escala mensal faz parte da rotina operacional. Usuários autenticados que
-- acessam a tela precisam criar o cabeçalho do mês e manter suas células.
CREATE POLICY "Authenticated users can insert monthly schedules"
ON public.monthly_schedules FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update monthly schedules"
ON public.monthly_schedules FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can insert monthly schedule entries"
ON public.monthly_schedule_entries FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update monthly schedule entries"
ON public.monthly_schedule_entries FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete monthly schedule entries"
ON public.monthly_schedule_entries FOR DELETE TO authenticated
USING (true);
