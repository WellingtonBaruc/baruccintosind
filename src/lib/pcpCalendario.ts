// PCP Calendar Engine — business day calculations

export interface PcpCalendarData {
  sabadoAtivo: boolean;
  domingoAtivo: boolean;
  feriados: string[]; // ISO date strings
  pausas: { inicio: string; fim: string }[];
}

function parseDate(d: string): Date {
  return new Date(d + 'T00:00:00');
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isInPausa(date: Date, pausas: { inicio: string; fim: string }[]): boolean {
  const ds = formatDate(date);
  return pausas.some(p => ds >= p.inicio && ds <= p.fim);
}

export function isDiaUtil(date: Date, cal: PcpCalendarData): boolean {
  const dow = date.getDay(); // 0=Sunday, 6=Saturday
  if (dow === 0 && !cal.domingoAtivo) return false;
  if (dow === 6 && !cal.sabadoAtivo) return false;
  if (cal.feriados.includes(formatDate(date))) return false;
  if (isInPausa(date, cal.pausas)) return false;
  return true;
}

/** Advance N business days from a base date */
export function adicionarDiasUteis(base: Date, diasUteis: number, cal: PcpCalendarData): Date {
  const result = new Date(base);
  let counted = 0;
  while (counted < diasUteis) {
    result.setDate(result.getDate() + 1);
    if (isDiaUtil(result, cal)) counted++;
  }
  return result;
}

/** Subtract N business days from a target date (go backwards) */
export function subtrairDiasUteis(target: Date, diasUteis: number, cal: PcpCalendarData): Date {
  const result = new Date(target);
  let counted = 0;
  while (counted < diasUteis) {
    result.setDate(result.getDate() - 1);
    if (isDiaUtil(result, cal)) counted++;
  }
  return result;
}

/** Count business days between two dates (exclusive of start, inclusive of end) */
export function contarDiasUteis(start: Date, end: Date, cal: PcpCalendarData): number {
  let count = 0;
  const current = new Date(start);
  const direction = end >= start ? 1 : -1;
  const target = new Date(end);

  if (direction > 0) {
    while (current < target) {
      current.setDate(current.getDate() + 1);
      if (isDiaUtil(current, cal)) count++;
    }
  } else {
    while (current > target) {
      current.setDate(current.getDate() - 1);
      if (isDiaUtil(current, cal)) count--;
    }
  }
  return count;
}

/** 
 * Calculate PCP dates for a sale:
 * - dataPcpCalculada: when production should be done (delivery date - shipping buffer)
 * - dataInicioIdeal: when production should start (dataPcpCalculada - lead_time)
 * - atrasoDias: business days between today and dataInicioIdeal (negative = late)
 * - prioridade: URGENTE / ATENCAO / NORMAL
 */
export function calcularPrazoPcp(
  dataPrevisaoEntrega: string | null,
  leadTimeDias: number,
  cal: PcpCalendarData,
  hoje?: Date,
): {
  dataPcpCalculada: string | null;
  dataInicioIdeal: string | null;
  atrasoDias: number;
  prioridade: 'URGENTE' | 'ATENCAO' | 'NORMAL';
} {
  if (!dataPrevisaoEntrega) {
    return { dataPcpCalculada: null, dataInicioIdeal: null, atrasoDias: 0, prioridade: 'NORMAL' };
  }

  const hj = hoje || new Date();
  hj.setHours(0, 0, 0, 0);

  const entrega = parseDate(dataPrevisaoEntrega);
  
  // dataPcpCalculada = delivery date (production must be done by this date)
  const dataPcpCalculada = entrega;
  
  // dataInicioIdeal = dataPcpCalculada - lead_time business days  
  const dataInicioIdeal = subtrairDiasUteis(dataPcpCalculada, leadTimeDias, cal);
  
  // atrasoDias = business days difference between today and dataInicioIdeal
  // negative = already late, positive = days remaining
  const atrasoDias = contarDiasUteis(hj, dataInicioIdeal, cal);
  
  let prioridade: 'URGENTE' | 'ATENCAO' | 'NORMAL';
  if (atrasoDias < 0) {
    prioridade = 'URGENTE';
  } else if (atrasoDias <= 2) {
    prioridade = 'ATENCAO';
  } else {
    prioridade = 'NORMAL';
  }

  return {
    dataPcpCalculada: formatDate(dataPcpCalculada),
    dataInicioIdeal: formatDate(dataInicioIdeal),
    atrasoDias,
    prioridade,
  };
}
