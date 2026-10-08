/** Convertit une date ISO en valeur pour <input type="datetime-local"> (heure locale). */
export function toLocalInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Convertit une valeur de <input type="datetime-local"> en ISO (UTC). */
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
