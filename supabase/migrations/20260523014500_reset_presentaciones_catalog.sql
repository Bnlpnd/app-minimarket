delete from public.presentaciones;

insert into public.presentaciones (nombre, activo)
values
  ('UND', true),
  ('PQTx3GLN', true),
  ('PQTx15BOT', true),
  ('BOT', true),
  ('CJAx12FCO', true),
  ('CJAx12', true),
  ('PLANCHA', true),
  ('PAQ', true),
  ('CJAx15', true),
  ('BOL', true),
  ('PAQx6', true),
  ('CAJx48', true),
  ('BOLx50', true),
  ('DPKx24', true),
  ('DPKx12', true),
  ('FCOx12', true),
  ('BARx48', true),
  ('BOLx20', true),
  ('PAQx24', true)
on conflict (nombre) do update
set activo = excluded.activo,
    updated_at = now();
