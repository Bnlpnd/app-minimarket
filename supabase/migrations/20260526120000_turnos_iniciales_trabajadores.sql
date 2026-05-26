-- Configurar turnos iniciales para los 3 trabajadores activos.
-- Dias en convencion JS: 0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab.

do $$
declare
  v_karla uuid := '93474c80-a71b-46ec-b277-d0331fbc8001';
  v_vane  uuid := '94c26d7b-3cbc-46ac-a9cf-976aa0846e82';
  v_andy  uuid := '44ce64ec-e0f8-4544-83f9-7c7586815ef4';
begin
  -- Limpia turnos previos para que la configuracion sea exacta a lo
  -- conversado. NO toca asistencias ya registradas.
  delete from public.personal_turnos
   where usuario_id in (v_karla, v_vane, v_andy);

  -- Karla: L-S 8a-6p S/45 + Dom 7a-3p S/45 + bono S/20 si cumple toda la semana.
  insert into public.personal_turnos
    (usuario_id, nombre, dias_aplica, hora_inicio, hora_fin, monto_pago)
  values
    (v_karla, 'Lunes a Sabado', ARRAY[1,2,3,4,5,6]::smallint[], '08:00', '18:00', 45),
    (v_karla, 'Domingo',         ARRAY[0]::smallint[],            '07:00', '15:00', 45);

  update public.app_usuarios
     set bono_asistencia_completa = 20,
         pago_hora = 4.50   -- fallback (L-S tarifa hora)
   where id = v_karla;

  -- Vanessa: Sab 7a-8p S/50 + Dom 7a-3p S/50 + Mie 2p-8p S/25 (medio turno).
  insert into public.personal_turnos
    (usuario_id, nombre, dias_aplica, hora_inicio, hora_fin, monto_pago)
  values
    (v_vane, 'Sabado',           ARRAY[6]::smallint[], '07:00', '20:00', 50),
    (v_vane, 'Domingo',          ARRAY[0]::smallint[], '07:00', '15:00', 50),
    (v_vane, 'Miercoles medio',  ARRAY[3]::smallint[], '14:00', '20:00', 25);

  update public.app_usuarios
     set bono_asistencia_completa = 0,
         pago_hora = 5.00   -- fallback (promedio aprox)
   where id = v_vane;

  -- Andy: Dia completo L-S 7a-9p S/45 + Medio dia L-S 2p-9p S/25 + Dom 7a-9p S/45.
  insert into public.personal_turnos
    (usuario_id, nombre, dias_aplica, hora_inicio, hora_fin, monto_pago)
  values
    (v_andy, 'Dia completo', ARRAY[1,2,3,4,5,6]::smallint[], '07:00', '21:00', 45),
    (v_andy, 'Medio dia',    ARRAY[1,2,3,4,5,6]::smallint[], '14:00', '21:00', 25),
    (v_andy, 'Domingo',      ARRAY[0]::smallint[],            '07:00', '21:00', 45);

  update public.app_usuarios
     set bono_asistencia_completa = 0,
         pago_hora = 3.21   -- fallback (tarifa dia completo)
   where id = v_andy;
end$$;
