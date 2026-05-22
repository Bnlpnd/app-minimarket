insert into public.roles (nombre, descripcion)
values
  ('trabajador', 'Operacion de tienda: ventas, pedidos, preparacion y almacen'),
  ('cliente', 'Cliente final para portal futuro')
on conflict (nombre) do nothing;
