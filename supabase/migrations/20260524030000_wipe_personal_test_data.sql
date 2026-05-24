-- Limpiar datos de prueba del modulo personal.
-- Conservamos los usuarios (admin y trabajadores). Borramos asistencias,
-- descuentos y pagos para empezar limpio con el nuevo diseno de UI.

delete from public.personal_pagos;
delete from public.personal_descuentos;
delete from public.personal_asistencias;
