-- Oculta cadastros órfãos que não chegaram a ser usados em nenhuma linha.
-- Registros ligados a acionamentos são preservados para não alterar o histórico.
-- A margem evita disputar com um salvamento que esteja ocorrendo neste momento.
update public.locations as location
set is_active = false
where location.is_active = true
  and location.created_at < now() - interval '10 minutes'
  and not exists (
    select 1
    from public.dispatches as dispatch
    where dispatch.origin_location_id = location.id
       or dispatch.destination_location_id = location.id
       or dispatch.final_destination_location_id = location.id
  );
