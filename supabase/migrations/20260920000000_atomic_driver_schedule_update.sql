-- Atualiza o cadastro do condutor e propaga turno/horário para as escalas
-- atuais e futuras dentro da mesma transação PostgreSQL.
CREATE OR REPLACE FUNCTION public.update_driver_and_future_schedule(
  p_driver_id UUID,
  p_changes JSONB,
  p_sync_shift BOOLEAN DEFAULT FALSE,
  p_sync_time BOOLEAN DEFAULT FALSE
)
RETURNS public.drivers
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  changed_driver public.drivers;
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  current_month INTEGER := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER;
BEGIN
  UPDATE public.drivers
  SET
    name = CASE WHEN p_changes ? 'name' THEN p_changes->>'name' ELSE name END,
    login_matricula = CASE WHEN p_changes ? 'login_matricula' THEN p_changes->>'login_matricula' ELSE login_matricula END,
    base_id = CASE WHEN p_changes ? 'base_id' THEN (p_changes->>'base_id')::UUID ELSE base_id END,
    default_shift = CASE WHEN p_changes ? 'default_shift' THEN p_changes->>'default_shift' ELSE default_shift END,
    default_start_time = CASE WHEN p_changes ? 'default_start_time' THEN (p_changes->>'default_start_time')::TIME ELSE default_start_time END,
    is_active = CASE WHEN p_changes ? 'is_active' THEN (p_changes->>'is_active')::BOOLEAN ELSE is_active END
  WHERE id = p_driver_id
  RETURNING * INTO changed_driver;

  IF changed_driver.id IS NULL THEN
    RAISE EXCEPTION 'DRIVER_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF p_sync_shift OR p_sync_time THEN
    UPDATE public.monthly_schedule_entries entry
    SET
      shift_letter = CASE WHEN p_sync_shift THEN changed_driver.default_shift ELSE entry.shift_letter END,
      shift_time = CASE WHEN p_sync_time THEN changed_driver.default_start_time ELSE entry.shift_time END
    FROM public.monthly_schedules schedule
    WHERE entry.schedule_id = schedule.id
      AND entry.driver_id = p_driver_id
      AND (entry.shift_letter IS NULL OR entry.shift_letter <> 'VF')
      AND (schedule.year > current_year OR (schedule.year = current_year AND schedule.month >= current_month));
  END IF;

  RETURN changed_driver;
END;
$$;

REVOKE ALL ON FUNCTION public.update_driver_and_future_schedule(UUID, JSONB, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_driver_and_future_schedule(UUID, JSONB, BOOLEAN, BOOLEAN) TO authenticated;
