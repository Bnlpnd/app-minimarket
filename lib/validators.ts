/**
 * Validadores centralizados.
 * Cada validador retorna { ok: true } o { ok: false, error: string }.
 * Usar en todos los forms en lugar de re-implementar reglas.
 */

export type ValidationResult = { ok: true } | { ok: false; error: string };

const PHONE_PE = /^9\d{8}$/;
const DIGITS_ONLY = /^\d+$/;

/**
 * Normaliza un telefono peruano: deja solo digitos, quita prefijo 51 si aparece.
 */
export function normalizePhonePe(value: string | null | undefined): string {
  if (!value) return "";
  let digits = value.replace(/\D+/g, "");
  if (digits.startsWith("51") && digits.length === 11) {
    digits = digits.slice(2);
  }
  return digits;
}

/**
 * Valida que un valor sea un numero de celular peruano (9 digitos empezando en 9).
 * Acepta vacio si `optional`.
 */
export function validatePhonePe(
  value: string | null | undefined,
  options: { optional?: boolean } = {},
): ValidationResult {
  const cleaned = normalizePhonePe(value);
  if (!cleaned) {
    return options.optional
      ? { ok: true }
      : { ok: false, error: "El telefono es obligatorio." };
  }
  if (!PHONE_PE.test(cleaned)) {
    return {
      ok: false,
      error: "Telefono peruano invalido. Debe tener 9 digitos y empezar en 9.",
    };
  }
  return { ok: true };
}

/**
 * Valida que un valor sea un precio no negativo (acepta 0).
 */
export function validatePrice(
  value: number | string | null | undefined,
  options: { allowZero?: boolean; label?: string } = {},
): ValidationResult {
  const label = options.label ?? "El precio";
  const num = Number(value);
  if (value === "" || value === null || value === undefined) {
    return { ok: false, error: `${label} es obligatorio.` };
  }
  if (!Number.isFinite(num)) {
    return { ok: false, error: `${label} debe ser un numero valido.` };
  }
  if (num < 0) {
    return { ok: false, error: `${label} no puede ser negativo.` };
  }
  if (!options.allowZero && num === 0) {
    return { ok: false, error: `${label} debe ser mayor que cero.` };
  }
  return { ok: true };
}

/**
 * Valida una cantidad (>0, finita).
 */
export function validateQuantity(
  value: number | string | null | undefined,
  options: { label?: string; allowZero?: boolean } = {},
): ValidationResult {
  const label = options.label ?? "La cantidad";
  const num = Number(value);
  if (value === "" || value === null || value === undefined) {
    return { ok: false, error: `${label} es obligatoria.` };
  }
  if (!Number.isFinite(num)) {
    return { ok: false, error: `${label} debe ser un numero valido.` };
  }
  if (num < 0) {
    return { ok: false, error: `${label} no puede ser negativa.` };
  }
  if (!options.allowZero && num <= 0) {
    return { ok: false, error: `${label} debe ser mayor que cero.` };
  }
  return { ok: true };
}

/**
 * Valida que unidades_por_presentacion sea > 0 (evita division por cero).
 */
export function validateUnits(
  value: number | string | null | undefined,
): ValidationResult {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return {
      ok: false,
      error: "Las unidades por presentacion deben ser mayores que cero.",
    };
  }
  return { ok: true };
}

/**
 * Valida que la hora de salida sea posterior a la de entrada (mismo dia).
 * El negocio NO opera de noche, asi que jornadas overnight se rechazan.
 */
export function validateHorarioLaboral(
  ingreso: string | null | undefined,
  salida: string | null | undefined,
): ValidationResult {
  if (!ingreso || !salida) {
    return { ok: false, error: "Ingresa hora de ingreso y de salida." };
  }
  const ingresoMin = toMinutes(ingreso);
  const salidaMin = toMinutes(salida);
  if (ingresoMin === null || salidaMin === null) {
    return { ok: false, error: "Hora invalida. Usa formato HH:MM." };
  }
  if (salidaMin <= ingresoMin) {
    return {
      ok: false,
      error: "La hora de salida debe ser mayor que la de ingreso.",
    };
  }
  return { ok: true };
}

function toMinutes(value: string): number | null {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * Valida codigo interno: no vacio, sin espacios al inicio/fin, no solo digitos cortos.
 */
export function validateCodigoInterno(
  value: string | null | undefined,
): ValidationResult {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "El codigo interno es obligatorio." };
  }
  if (trimmed.length < 2) {
    return { ok: false, error: "El codigo interno debe tener al menos 2 caracteres." };
  }
  return { ok: true };
}

/**
 * Compone varios resultados; retorna el primer error o ok.
 */
export function combineValidations(...results: ValidationResult[]): ValidationResult {
  for (const r of results) {
    if (!r.ok) return r;
  }
  return { ok: true };
}

export { PHONE_PE, DIGITS_ONLY };
