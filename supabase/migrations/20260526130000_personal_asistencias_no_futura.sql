-- Defensa profunda: a nivel de DB rechazar asistencias con fecha futura.
-- El cliente tambien valida, pero esto evita inconsistencias si alguien
-- inserta directo via API.

create or replace function public.no_asistencia_futura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fecha > current_date then
    raise exception 'No se puede registrar asistencia en fecha futura (%)', new.fecha;
  end if;
  return new;
end;
$$;

drop trigger if exists no_asistencia_futura_trigger on public.personal_asistencias;
create trigger no_asistencia_futura_trigger
  before insert or update on public.personal_asistencias
  for each row execute function public.no_asistencia_futura();
