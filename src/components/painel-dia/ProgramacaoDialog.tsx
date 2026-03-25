import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import { TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE } from '@/lib/pcp';
import { PcpCalendarData, isDiaUtil } from '@/lib/pcpCalendario';
import { STATUS_PCP_CONFIG, ETIQUETA_CONFIG, type PedidoPainelDia } from '@/lib/pcpPainelDia';
import { CalendarIcon, CalendarPlus, Zap, AlertTriangle, CheckCircle, Loader2, Clock, TrendingUp, Package, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  pedido: PedidoPainelDia | null;
  tipo: 'inicio' | 'conclusao';
  cal: PcpCalendarData;
  capacidadePadrao: { sintetico: number; tecido: number; total: number };
  onConfirm: (pedido: PedidoPainelDia, data: string, tipo: 'inicio' | 'conclusao') => void;
}

interface CargaDia {
  sintetico: number;
  tecido: number;
  total: number;
}

interface SugestaoData {
  data: string;
  saldo: number;
  carga: number;
  capacidade: number;
}

export default function ProgramacaoDialog({ open, onClose, pedido, tipo, cal, capacidadePadrao, onConfirm }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [showCalendar, setShowCalendar] = useState(false);
  const [cargaDia, setCargaDia] = useState<CargaDia>({ sintetico: 0, tecido: 0, total: 0 });
  const [capacidadeDia, setCapacidadeDia] = useState(capacidadePadrao);
  const [loadingCarga, setLoadingCarga] = useState(false);
  const [melhorDiaLoading, setMelhorDiaLoading] = useState(false);
  const [sugestoes, setSugestoes] = useState<SugestaoData[]>([]);

  // Reset state when dialog opens with new pedido
  useEffect(() => {
    if (open && pedido) {
      // Pre-select existing date if reprogramming
      const existingDate = tipo === 'inicio' ? pedido.programado_inicio_data : pedido.programado_conclusao_data;
      if (existingDate) {
        setSelectedDate(new Date(existingDate + 'T00:00:00'));
      } else {
        setSelectedDate(undefined);
      }
      setShowCalendar(false);
      setSugestoes([]);
      setCargaDia({ sintetico: 0, tecido: 0, total: 0 });
    }
  }, [open, pedido, tipo]);

  const hojeStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const hoje = new Date(hojeStr + 'T00:00:00');

  const isReprogramacao = useMemo(() => {
    if (!pedido) return false;
    return tipo === 'inicio' ? !!pedido.programado_inicio_data : !!pedido.programado_conclusao_data;
  }, [pedido, tipo]);

  // Quick date options
  const quickDates = useMemo(() => {
    const options: { label: string; date: Date; emoji: string }[] = [];
    options.push({ label: 'Hoje', date: new Date(hoje), emoji: '📌' });

    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    options.push({ label: 'Amanhã', date: amanha, emoji: '📅' });

    // Next business day
    let proxUtil = new Date(hoje);
    proxUtil.setDate(proxUtil.getDate() + 1);
    let attempts = 0;
    while (!isDiaUtil(proxUtil, cal) && attempts < 14) {
      proxUtil.setDate(proxUtil.getDate() + 1);
      attempts++;
    }
    if (proxUtil.getTime() !== amanha.getTime()) {
      options.push({ label: 'Próx. dia útil', date: proxUtil, emoji: '⏭️' });
    }

    return options;
  }, [hojeStr, cal]);

  // Helper to load capacity + load for a given date
  const loadCapacidadeData = async (ds: string): Promise<{ cap: typeof capacidadePadrao; carga: CargaDia }> => {
    const { data: capDia } = await supabase
      .from('pcp_capacidade_diaria')
      .select('capacidade_sintetico, capacidade_tecido, capacidade_total')
      .eq('data', ds)
      .maybeSingle();

    const cap = capDia
      ? { sintetico: capDia.capacidade_sintetico, tecido: capDia.capacidade_tecido, total: capDia.capacidade_total }
      : capacidadePadrao;

    // Get all scheduled orders for that day (both inicio and conclusao)
    const [ordensInicio, ordensConclusao] = await Promise.all([
      supabase.from('ordens_producao')
        .select('id, tipo_produto, pedidos!inner(id)')
        .eq('programado_inicio_data', ds)
        .not('status', 'eq', 'CANCELADA'),
      supabase.from('ordens_producao')
        .select('id, tipo_produto, pedidos!inner(id)')
        .eq('programado_conclusao_data', ds)
        .not('status', 'eq', 'CANCELADA'),
    ]);

    // Merge unique orders
    const allOrdens = [...(ordensInicio.data || []), ...(ordensConclusao.data || [])];
    const uniqueOrdens = Array.from(new Map(allOrdens.map(o => [o.id, o])).values());
    // Exclude current pedido's order if reprogramming
    const filteredOrdens = pedido ? uniqueOrdens.filter(o => o.id !== pedido.id) : uniqueOrdens;

    const pedidoIds = [...new Set(filteredOrdens.map((o: any) => o.pedidos.id))];
    let sintetico = 0, tecido = 0;

    if (pedidoIds.length > 0) {
      const { data: itens } = await supabase
        .from('pedido_itens')
        .select('pedido_id, quantidade, categoria_produto, descricao_produto')
        .in('pedido_id', pedidoIds);

      const qtdMap: Record<string, number> = {};
      for (const item of (itens || [])) {
        const cat = (item.categoria_produto || '').toUpperCase();
        const desc = (item.descricao_produto || '').toUpperCase();
        if (cat === 'ADICIONAIS' || desc.includes('ADICIONAL')) continue;
        qtdMap[item.pedido_id] = (qtdMap[item.pedido_id] || 0) + item.quantidade;
      }

      for (const o of filteredOrdens) {
        const qty = qtdMap[(o as any).pedidos.id] || 0;
        if (o.tipo_produto === 'SINTETICO') sintetico += qty;
        else if (o.tipo_produto === 'TECIDO') tecido += qty;
      }
    }

    return { cap, carga: { sintetico, tecido, total: sintetico + tecido } };
  };

  // Load capacity when date changes
  useEffect(() => {
    if (!selectedDate || !pedido) return;
    const ds = selectedDate.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    setLoadingCarga(true);

    loadCapacidadeData(ds).then(({ cap, carga }) => {
      setCapacidadeDia(cap);
      setCargaDia(carga);
      setLoadingCarga(false);
    });
  }, [selectedDate, pedido, tipo, capacidadePadrao]);

  // Find best days with available capacity (returns top 3 suggestions)
  const findMelhorDia = async () => {
    if (!pedido) return;
    setMelhorDiaLoading(true);
    setSugestoes([]);

    const pecas = pedido.quantidade_itens;
    const tipoKey = pedido.tipo_produto === 'TECIDO' ? 'tecido' : 'sintetico';
    const found: SugestaoData[] = [];

    let checkDate = new Date(hoje);
    let checked = 0;

    while (found.length < 3 && checked < 45) {
      if (isDiaUtil(checkDate, cal)) {
        const ds = checkDate.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        const { cap, carga } = await loadCapacidadeData(ds);
        const saldo = cap[tipoKey] - carga[tipoKey];

        if (saldo >= pecas) {
          found.push({ data: ds, saldo, carga: carga[tipoKey], capacidade: cap[tipoKey] });
        }
      }
      checkDate.setDate(checkDate.getDate() + 1);
      checked++;
    }

    setSugestoes(found);
    if (found.length > 0) {
      setSelectedDate(new Date(found[0].data + 'T00:00:00'));
    }
    setMelhorDiaLoading(false);
  };

  if (!pedido) return null;

  const tipoKey = pedido.tipo_produto === 'TECIDO' ? 'tecido' : 'sintetico';
  const novaCarga = cargaDia[tipoKey] + pedido.quantidade_itens;
  const capTipo = capacidadeDia[tipoKey];
  const saldoFinal = capTipo - novaCarga;
  const excedido = saldoFinal < 0 && capTipo > 0;
  const proximo = saldoFinal >= 0 && saldoFinal <= capTipo * 0.1 && capTipo > 0;
  const cargaPct = capTipo > 0 ? Math.min((novaCarga / capTipo) * 100, 100) : 0;

  const saldoColor = excedido ? 'text-destructive' : proximo ? 'text-amber-600' : 'text-emerald-600';
  const saldoBg = excedido ? 'bg-destructive/10' : proximo ? 'bg-amber-500/10' : 'bg-emerald-500/10';
  const progressColor = excedido ? '[&>div]:bg-destructive' : proximo ? '[&>div]:bg-amber-500' : '';

  const statusCfg = STATUS_PCP_CONFIG[pedido.status_pcp];
  const etiqCfg = ETIQUETA_CONFIG[pedido.etiqueta];

  const handleConfirm = () => {
    if (!selectedDate || !pedido) return;
    const ds = selectedDate.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    onConfirm(pedido, ds, tipo);
    onClose();
  };

  const disableDate = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d < hoje || !isDiaUtil(d, cal);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className={`h-4 w-4 ${tipo === 'inicio' ? 'text-blue-600' : 'text-emerald-600'}`} />
            {isReprogramacao ? 'Reprogramar' : 'Programar'} {tipo === 'inicio' ? 'Início' : 'Conclusão'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Selecione a data e verifique a capacidade antes de confirmar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Order details card */}
          <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{pedido.api_venda_id || pedido.numero_pedido}</span>
              <Badge className={`text-[10px] px-1.5 py-0 ${TIPO_PRODUTO_BADGE[pedido.tipo_produto || ''] || ''}`}>
                {TIPO_PRODUTO_LABELS[pedido.tipo_produto || ''] || pedido.tipo_produto}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">{pedido.cliente_nome}</div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <Package className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{pedido.quantidade_itens}</span>
                <span className="text-muted-foreground">peças</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Entrega:</span>
                <span className="font-medium">
                  {pedido.data_previsao_entrega ? format(new Date(pedido.data_previsao_entrega + 'T00:00:00'), 'dd/MM') : '—'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px]">{statusCfg.icon}</span>
                <span className="text-muted-foreground">{statusCfg.label}</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Score:</span>
                <span className="font-mono font-medium">{pedido.score_prioridade}</span>
              </div>
            </div>

            {pedido.data_inicio_ideal && (
              <div className="text-[11px] text-muted-foreground">
                Início ideal: <span className="font-medium text-foreground">{format(new Date(pedido.data_inicio_ideal + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                {pedido.etiqueta && (
                  <Badge className={`ml-2 text-[9px] px-1 py-0 ${etiqCfg.color}`}>{etiqCfg.label}</Badge>
                )}
              </div>
            )}

            {isReprogramacao && (
              <div className="text-[11px] text-amber-600 bg-amber-500/10 rounded px-2 py-1">
                ⚠️ Este pedido já está programado para{' '}
                <span className="font-medium">
                  {format(new Date((tipo === 'inicio' ? pedido.programado_inicio_data! : pedido.programado_conclusao_data!) + 'T00:00:00'), 'dd/MM/yyyy')}
                </span>. Escolher nova data irá reprogramar.
              </div>
            )}
          </div>

          <Separator />

          {/* Quick dates */}
          <div className="space-y-2">
            <span className="text-xs font-medium">Selecionar data</span>
            <div className="flex gap-2 flex-wrap">
              {quickDates.map((qd) => {
                const qdStr = qd.date.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
                const isSelected = selectedDate?.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) === qdStr;
                return (
                  <Button
                    key={qd.label}
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    className={cn("h-8 text-xs gap-1", isSelected && tipo === 'conclusao' && 'bg-emerald-600 hover:bg-emerald-700')}
                    onClick={() => { setSelectedDate(qd.date); setShowCalendar(false); setSugestoes([]); }}
                  >
                    <span>{qd.emoji}</span> {qd.label} ({format(qd.date, 'dd/MM')})
                  </Button>
                );
              })}
              <Button
                size="sm"
                variant={showCalendar ? 'secondary' : 'outline'}
                className="h-8 text-xs gap-1"
                onClick={() => setShowCalendar(!showCalendar)}
              >
                <CalendarIcon className="h-3 w-3" />
                Escolher data
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5"
                onClick={findMelhorDia}
                disabled={melhorDiaLoading}
              >
                {melhorDiaLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                Melhor dia
              </Button>
            </div>
          </div>

          {/* Calendar */}
          {showCalendar && (
            <div className="border rounded-lg overflow-hidden">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => { if (d) { setSelectedDate(d); setShowCalendar(false); setSugestoes([]); } }}
                disabled={disableDate}
                locale={ptBR}
                className={cn("p-3 pointer-events-auto")}
              />
            </div>
          )}

          {/* Suggestions from "Melhor dia" */}
          {sugestoes.length > 0 && (
            <div className="border rounded-lg p-3 space-y-2 bg-primary/5">
              <span className="text-xs font-medium flex items-center gap-1">
                <Zap className="h-3 w-3 text-primary" /> Sugestões com capacidade disponível
              </span>
              <div className="grid gap-1.5">
                {sugestoes.map((s) => {
                  const isSelected = selectedDate?.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) === s.data;
                  return (
                    <button
                      key={s.data}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded text-xs transition-colors",
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted border'
                      )}
                      onClick={() => setSelectedDate(new Date(s.data + 'T00:00:00'))}
                    >
                      <span className="font-medium">
                        {format(new Date(s.data + 'T00:00:00'), "EEEE, dd/MM", { locale: ptBR })}
                      </span>
                      <span className={isSelected ? '' : 'text-emerald-600'}>
                        Saldo: {s.saldo} ({s.carga}/{s.capacidade})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Capacity preview */}
          {selectedDate && (
            <div className={cn("border rounded-lg p-3 space-y-3", excedido ? 'border-destructive/40' : 'border-border')}>
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  📊 Capacidade — {format(selectedDate, "EEEE, dd/MM/yyyy", { locale: ptBR })}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {TIPO_PRODUTO_LABELS[pedido.tipo_produto || ''] || pedido.tipo_produto}
                </Badge>
              </div>

              {loadingCarga ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculando carga do dia...
                </div>
              ) : (
                <>
                  {/* Capacity grid */}
                  <div className="grid grid-cols-5 gap-1.5 text-xs">
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <div className="text-[10px] text-muted-foreground">Capacidade</div>
                      <div className="font-bold text-sm">{capTipo}</div>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <div className="text-[10px] text-muted-foreground">Programado</div>
                      <div className="font-bold text-sm">{cargaDia[tipoKey]}</div>
                    </div>
                    <div className="text-center p-2 bg-blue-500/10 rounded">
                      <div className="text-[10px] text-muted-foreground">Pedido atual</div>
                      <div className="font-bold text-sm text-blue-600">+{pedido.quantidade_itens}</div>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <div className="text-[10px] text-muted-foreground">Nova carga</div>
                      <div className={cn("font-bold text-sm", excedido ? 'text-destructive' : '')}>{novaCarga}</div>
                    </div>
                    <div className={cn("text-center p-2 rounded", saldoBg)}>
                      <div className="text-[10px] text-muted-foreground">Saldo final</div>
                      <div className={cn("font-bold text-sm", saldoColor)}>{saldoFinal}</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <Progress value={cargaPct} className={cn("h-2.5", progressColor)} />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{Math.round(cargaPct)}% utilizado</span>
                      <span>{novaCarga} / {capTipo}</span>
                    </div>
                  </div>

                  {/* Warning */}
                  {excedido && (
                    <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-2.5">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium">Capacidade excedida!</div>
                        <div className="text-destructive/80">A carga ficará {Math.abs(saldoFinal)} peças acima do limite. Use "Melhor dia" para encontrar datas com saldo.</div>
                      </div>
                    </div>
                  )}

                  {proximo && !excedido && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/5 border border-amber-500/20 rounded-md p-2">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      Capacidade próxima do limite.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedDate || loadingCarga}
            className={cn(
              tipo === 'inicio' ? '' : 'bg-emerald-600 hover:bg-emerald-700',
              excedido && 'bg-destructive hover:bg-destructive/90'
            )}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            {isReprogramacao ? 'Reprogramar' : 'Confirmar'} {tipo === 'inicio' ? 'Início' : 'Conclusão'}
            {selectedDate && ` — ${format(selectedDate, 'dd/MM')}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
