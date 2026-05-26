import type { PersonalAsistencia, PersonalTurno } from "@/types/database";

/** Devuelve horas decimales entre dos horas HH:MM. 0 si invalido o overnight. */
export function hoursBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const st = sh * 60 + sm;
  const et = eh * 60 + em;
  if (!Number.isFinite(st) || !Number.isFinite(et) || et <= st) return 0;
  return (et - st) / 60;
}

/** Dia de la semana (0=Dom, 1=Lun, ..., 6=Sab) de una fecha YYYY-MM-DD. */
export function diaSemana(fechaIso: string): number {
  const [y, m, d] = fechaIso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getDay();
}

/**
 * Selecciona el turno que mejor calza con una asistencia.
 * Prioridad:
 *   1) Si la asistencia ya tiene turno_id, usarlo.
 *   2) Turnos activos del usuario que aplican al dia.
 *   3) Si hay 1 solo → usarlo.
 *   4) Si hay varios → elegir el que CONTIENE el rango de la ficha
 *      (ingreso ≥ inicio - tolerancia AND salida ≤ fin + tolerancia).
 *      Si varios calzan, el de mayor monto.
 *   5) Si ninguno calza explicito → el mas cercano por horas; sino el primero.
 */
export function elegirTurnoParaAsistencia(
  asistencia: Pick<PersonalAsistencia, "fecha" | "hora_ingreso" | "hora_salida" | "turno_id">,
  turnos: PersonalTurno[],
): PersonalTurno | null {
  if (asistencia.turno_id) {
    const directo = turnos.find((t) => t.id === asistencia.turno_id);
    if (directo) return directo;
  }
  const dia = diaSemana(asistencia.fecha);
  const candidatos = turnos.filter((t) => t.activo && t.dias_aplica.includes(dia));
  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0];

  const ingresoMin = horaToMinutos(asistencia.hora_ingreso);
  const salidaMin = horaToMinutos(asistencia.hora_salida);

  // Subconjunto de turnos que "contienen" la ficha (con tolerancia 30min).
  const TOLERANCIA = 30;
  const contienen = candidatos.filter((t) => {
    const ti = horaToMinutos(t.hora_inicio);
    const tf = horaToMinutos(t.hora_fin);
    if (ti == null || tf == null) return false;
    if (ingresoMin == null || salidaMin == null) return false;
    return ingresoMin >= ti - TOLERANCIA && salidaMin <= tf + TOLERANCIA;
  });
  if (contienen.length > 0) {
    // Mayor monto (mejor para el trabajador) si varios calzan.
    return contienen.sort((a, b) => Number(b.monto_pago) - Number(a.monto_pago))[0];
  }
  // Fallback: el de mayor duracion (probablemente "dia completo").
  return candidatos.sort((a, b) => {
    const da = hoursBetween(a.hora_inicio, a.hora_fin);
    const db = hoursBetween(b.hora_inicio, b.hora_fin);
    return db - da;
  })[0];
}

function horaToMinutos(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * Calcula el pago de UN dia para una asistencia.
 *
 * Regla:
 * - Si hay turno: las horas DENTRO del horario del turno pagan tarifa
 *   del turno (monto/horas_turno). Las horas FUERA del horario (antes
 *   o despues, "horas extra") pagan a la tarifa hora general del
 *   trabajador (pagoHoraGeneral).
 *
 *   Ejemplo: turno 8a-9a S/20 (tarifa S/20/h). Pago_hora general S/3.
 *   Si trabaja 6a-11a (5h reales):
 *     - dentro del turno (8-9): 1h × 20 = S/20
 *     - fuera (6-8 y 9-11): 4h × 3 = S/12
 *     - total: S/32
 *
 * - Si NO hay turno: todas las horas a pagoHoraGeneral.
 * - Si tampoco hay pagoHoraGeneral: 0.
 */
export function pagoPorDia(
  asistencia: PersonalAsistencia,
  turno: PersonalTurno | null,
  pagoHoraGeneral: number,
): { horas: number; tarifaHora: number; pago: number; turno: PersonalTurno | null } {
  const horas = hoursBetween(asistencia.hora_ingreso, asistencia.hora_salida);
  if (horas <= 0) return { horas: 0, tarifaHora: 0, pago: 0, turno };

  if (turno) {
    const horasTurno = hoursBetween(turno.hora_inicio, turno.hora_fin);
    const tarifaTurno = horasTurno > 0 ? Number(turno.monto_pago) / horasTurno : 0;

    // Interseccion entre [ingreso, salida] y [turno.inicio, turno.fin].
    const ingMin = horaToMinutos(asistencia.hora_ingreso);
    const salMin = horaToMinutos(asistencia.hora_salida);
    const tIni = horaToMinutos(turno.hora_inicio);
    const tFin = horaToMinutos(turno.hora_fin);
    if (ingMin == null || salMin == null || tIni == null || tFin == null) {
      // Sin datos suficientes, cae al modelo simple.
      return { horas, tarifaHora: tarifaTurno, pago: horas * tarifaTurno, turno };
    }
    const interInicio = Math.max(ingMin, tIni);
    const interFin = Math.min(salMin, tFin);
    const horasDentro = Math.max(0, (interFin - interInicio) / 60);
    const horasFuera = Math.max(0, horas - horasDentro);

    const pago = horasDentro * tarifaTurno + horasFuera * pagoHoraGeneral;
    return { horas, tarifaHora: tarifaTurno, pago, turno };
  }

  if (pagoHoraGeneral > 0) {
    return { horas, tarifaHora: pagoHoraGeneral, pago: horas * pagoHoraGeneral, turno: null };
  }
  return { horas, tarifaHora: 0, pago: 0, turno: null };
}

/**
 * Resumen del pago de una semana para un trabajador.
 */
export type ResumenSemanaPago = {
  diasTrabajados: number;
  horasTrabajadas: number;
  subtotalDias: number;
  bonoAplicado: number;
  total: number;
};

/**
 * Calcula el pago de toda la semana incluyendo bono de asistencia completa
 * si el trabajador cumplio TODOS sus turnos activos (ingreso ≤ inicio_turno
 * Y salida ≥ fin_turno en cada dia que tiene turno definido).
 */
export function calcularPagoSemanal(args: {
  asistencias: PersonalAsistencia[]; // de la semana
  turnos: PersonalTurno[]; // del trabajador
  pagoHoraGeneral: number;
  bonoSemanaCompleta: number;
  // Fechas de la semana (lunes a domingo, formato YYYY-MM-DD).
  fechasSemana: string[];
}): ResumenSemanaPago {
  let subtotal = 0;
  let horasTotal = 0;
  let dias = 0;

  for (const a of args.asistencias) {
    const turno = elegirTurnoParaAsistencia(a, args.turnos);
    const calc = pagoPorDia(a, turno, args.pagoHoraGeneral);
    if (calc.pago > 0) {
      subtotal += calc.pago;
      horasTotal += calc.horas;
      dias += 1;
    }
  }

  // Evaluar bono: por cada combinacion (turno, dia que aplica) debe existir
  // asistencia con ingreso ≤ inicio y salida ≥ fin.
  let bono = 0;
  if (args.bonoSemanaCompleta > 0) {
    const turnosActivos = args.turnos.filter((t) => t.activo);
    if (turnosActivos.length > 0) {
      let cumpleTodo = true;
      for (const fecha of args.fechasSemana) {
        const dia = diaSemana(fecha);
        const turnosDia = turnosActivos.filter((t) => t.dias_aplica.includes(dia));
        for (const turno of turnosDia) {
          const asist = args.asistencias.find(
            (a) =>
              a.fecha === fecha &&
              (a.turno_id === turno.id || a.turno_id === null),
          );
          if (!asist || !asist.hora_ingreso || !asist.hora_salida) {
            cumpleTodo = false;
            break;
          }
          const ingMin = horaToMinutos(asist.hora_ingreso);
          const salMin = horaToMinutos(asist.hora_salida);
          const tIni = horaToMinutos(turno.hora_inicio);
          const tFin = horaToMinutos(turno.hora_fin);
          if (
            ingMin == null ||
            salMin == null ||
            tIni == null ||
            tFin == null ||
            ingMin > tIni ||
            salMin < tFin
          ) {
            cumpleTodo = false;
            break;
          }
        }
        if (!cumpleTodo) break;
      }
      if (cumpleTodo) bono = args.bonoSemanaCompleta;
    }
  }

  return {
    diasTrabajados: dias,
    horasTrabajadas: horasTotal,
    subtotalDias: subtotal,
    bonoAplicado: bono,
    total: subtotal + bono,
  };
}
