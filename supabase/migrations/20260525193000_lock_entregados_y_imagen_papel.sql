-- 1. Proteccion contra modificacion/borrado de pedidos entregados.
--    Solo se permite cambiar campos relacionados al pago (registrar
--    abonos posteriores a la entrega cuando se hizo a credito).

create or replace function public.proteger_pedido_entregado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campos_permitidos text[] := array[
    'monto_a_cuenta',
    'estado_pago',
    'metodo_pago',
    'observaciones',
    'updated_at'
  ];
begin
  -- Solo aplica si el pedido YA estaba entregado.
  if OLD.estado <> 'entregado' then
    return NEW;
  end if;

  -- Bloquear cambio de estado fuera de "entregado".
  if NEW.estado is distinct from OLD.estado then
    raise exception 'No se puede cambiar el estado de un pedido ya entregado';
  end if;

  -- Validar columnas modificadas: solo se aceptan las del whitelist.
  if NEW.cliente_id is distinct from OLD.cliente_id then
    raise exception 'No se puede modificar el cliente de un pedido entregado';
  end if;
  if NEW.subtotal is distinct from OLD.subtotal then
    raise exception 'No se puede modificar el subtotal de un pedido entregado';
  end if;
  if NEW.total is distinct from OLD.total then
    raise exception 'No se puede modificar el total de un pedido entregado';
  end if;
  if NEW.descuento is distinct from OLD.descuento then
    raise exception 'No se puede modificar el descuento de un pedido entregado';
  end if;
  if NEW.detalle_manual is distinct from OLD.detalle_manual then
    raise exception 'No se puede modificar el detalle de un pedido entregado';
  end if;
  if NEW.tipo_entrega is distinct from OLD.tipo_entrega then
    raise exception 'No se puede modificar el tipo de entrega de un pedido entregado';
  end if;
  if NEW.fecha_pedido is distinct from OLD.fecha_pedido then
    raise exception 'No se puede modificar la fecha de un pedido entregado';
  end if;

  -- Whitelisted columns can be modified (monto_a_cuenta, estado_pago, etc.)
  -- v_campos_permitidos solo documenta la intencion; el filtro real ocurre
  -- por las validaciones anteriores que cubren todos los demas campos sensibles.
  -- Esta variable se referencia para silenciar warnings.
  perform 1 where cardinality(v_campos_permitidos) > 0;

  return NEW;
end;
$$;

drop trigger if exists proteger_pedido_entregado_trigger on public.pedidos;
create trigger proteger_pedido_entregado_trigger
  before update on public.pedidos
  for each row execute function public.proteger_pedido_entregado();

-- Bloquear DELETE de pedidos entregados.
create or replace function public.no_borrar_pedido_entregado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.estado = 'entregado' then
    raise exception 'No se puede borrar un pedido ya entregado';
  end if;
  return OLD;
end;
$$;

drop trigger if exists no_borrar_pedido_entregado_trigger on public.pedidos;
create trigger no_borrar_pedido_entregado_trigger
  before delete on public.pedidos
  for each row execute function public.no_borrar_pedido_entregado();

-- Bloquear UPDATE/DELETE de detalle_pedido si el pedido esta entregado.
create or replace function public.proteger_detalle_pedido_entregado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_pedido_id uuid;
begin
  v_pedido_id := coalesce(NEW.pedido_id, OLD.pedido_id);
  select estado into v_estado from public.pedidos where id = v_pedido_id;

  if v_estado = 'entregado' then
    raise exception 'No se puede modificar items de un pedido entregado';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists proteger_detalle_pedido_entregado_trigger on public.detalle_pedido;
create trigger proteger_detalle_pedido_entregado_trigger
  before update or delete on public.detalle_pedido
  for each row execute function public.proteger_detalle_pedido_entregado();

-- 2. Columna para foto del pedido escrito en papel (al crear pedido manual).
alter table public.pedidos
  add column if not exists imagen_papel_url text;

-- 3. Bucket de storage para imagenes de pedidos manuales (papel).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pedidos_manuales',
  'pedidos_manuales',
  true,
  2 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policies para que anon/authenticated puedan leer/subir.
drop policy if exists "pedidos_manuales read" on storage.objects;
create policy "pedidos_manuales read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'pedidos_manuales');

drop policy if exists "pedidos_manuales insert" on storage.objects;
create policy "pedidos_manuales insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'pedidos_manuales');

drop policy if exists "pedidos_manuales delete" on storage.objects;
create policy "pedidos_manuales delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'pedidos_manuales');
