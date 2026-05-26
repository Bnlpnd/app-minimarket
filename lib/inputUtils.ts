import type { FocusEvent } from "react";

/**
 * Selecciona todo el texto del input al recibir foco.
 * Util en inputs numericos donde el usuario quiere reemplazar el valor:
 * sin esto, al hacer click en un input con "1" y escribir "20", queda "120".
 */
export const selectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};
