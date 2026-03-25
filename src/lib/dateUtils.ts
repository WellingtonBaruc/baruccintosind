/**
 * Utility functions for consistent Brasília timezone (America/Sao_Paulo) usage.
 * 
 * Problem: `new Date().toISOString()` returns UTC. Between 21:00–23:59 Brasília time,
 * `.slice(0,10)` returns TOMORROW's date in UTC, causing wrong date calculations,
 * wrong "today" filters, and incorrect PCP scheduling.
 * 
 * Solution: Always use these helpers for date strings and timestamps.
 */

const TIMEZONE = 'America/Sao_Paulo';

/** Returns today's date as 'YYYY-MM-DD' in Brasília timezone */
export function hojeBrasilia(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
}

/** Returns current datetime as ISO string adjusted to Brasília timezone */
export function agoraBrasilia(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: TIMEZONE }).replace(' ', 'T') + '.000-03:00';
}

/** Converts a Date object to 'YYYY-MM-DD' in Brasília timezone */
export function formatDateBrasilia(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
}

/** Returns a Date object set to midnight of today in Brasília timezone */
export function hojeDate(): Date {
  const todayStr = hojeBrasilia();
  return new Date(todayStr + 'T00:00:00');
}

/** Format a timestamptz string to Brasília display format */
export function formatTimestampBrasilia(
  isoString: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const defaults: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };
  return new Date(isoString).toLocaleString('pt-BR', options || defaults);
}
