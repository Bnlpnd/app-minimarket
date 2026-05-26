function toDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDate(value: string | Date | null | undefined) {
  const date = toDate(value);

  if (!date) {
    return "Sin fecha";
  }

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTime(value: string | Date | null | undefined) {
  const date = toDate(value);

  if (!date) {
    return "Sin fecha";
  }

  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseInputDate(value: string | Date | null | undefined) {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

export function formatTime(value: string | null | undefined) {
  if (!value) {
    return "Sin hora";
  }

  return value.slice(0, 5);
}
