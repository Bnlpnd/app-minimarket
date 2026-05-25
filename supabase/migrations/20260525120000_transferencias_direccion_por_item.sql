alter table public.almacen_transferencias_items
  add column if not exists almacen_origen_id uuid references public.almacenes(id) on delete restrict,
  add column if not exists almacen_destino_id uuid references public.almacenes(id) on delete restrict;

do $$
declare
  v_casa uuid;
  v_tienda uuid;
begin
  select id into v_casa from public.almacenes where lower(nombre) = 'casa' limit 1;
  select id into v_tienda from public.almacenes where lower(nombre) in ('tienda', 'negocio') order by case lower(nombre) when 'tienda' then 1 else 2 end limit 1;

  if v_casa is not null and v_tienda is not null then
    update public.almacen_transferencias_items
       set almacen_origen_id = coalesce(almacen_origen_id, v_casa),
           almacen_destino_id = coalesce(almacen_destino_id, v_tienda)
     where almacen_origen_id is null or almacen_destino_id is null;
  end if;
end$$;

alter table public.almacen_transferencias_items
  drop constraint if exists almacen_transferencias_items_direccion_distinta;
alter table public.almacen_transferencias_items
  add constraint almacen_transferencias_items_direccion_distinta
  check (almacen_origen_id is null or almacen_destino_id is null or almacen_origen_id <> almacen_destino_id);

create index if not exists idx_almacen_transferencias_items_origen
  on public.almacen_transferencias_items (almacen_origen_id);
create index if not exists idx_almacen_transferencias_items_destino
  on public.almacen_transferencias_items (almacen_destino_id);
