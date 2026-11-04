const pad = (n: number): string => String(n).padStart(2, "0");

/** An ISO instant as the value of a `datetime-local` input: the local date and time, to the minute. */
export function toLocalInput(iso: string | null): string {
  if (iso === null) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The value of a `datetime-local` input as an ISO instant, or null when empty or not a date. */
export function fromLocalInput(value: string): string | null {
  if (value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
