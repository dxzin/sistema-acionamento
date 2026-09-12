alter table public.dispatches
  alter column cargo_status type text
  using cargo_status::text;

drop type if exists public.cargo_status_enum;
