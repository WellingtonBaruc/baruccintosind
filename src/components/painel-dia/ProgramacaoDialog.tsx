import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE } from '@/lib/pcp';
import { PcpCalendarData, isDiaUtil, adicionarDiasUteis } from '@/lib/pcpCalendario';
import { type PedidoPainelDia } from '@/lib/pcpPainelDia';
import { CalendarIcon, CalendarPlus, Zap, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
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

export default function ProgramacaoDialog({ open, onClose, pedido, tipo, cal, capacidadePadrao, onConfirm }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [showCalendar, setShowCalendar] = useState(false);
  const [cargaDia, setCargaDia] = useState<CargaDia>({ sintetico: 0, tecido: 0, total: 0 });
  const [capacidadeDia, setCapacidadeDia] = useState(capacidadePadrao);
  const [loadingCarga, setLoadingCarga] = useState(false);
  const [melhorDiaLoading, setMelhorDiaLoading] = useState(false);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeStr = hoje.toISOString().slice(0, 10);

  // Quick date options
  const quickDates = useMemo(() => {
    const options: { label: string; date: Date }[] = [];
    options.push({ label: 'Hoje', date: new Date(hoje) });

    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    options.push({ label: 'Amanhã', date: amanha });

    // Next business day (skip weekends/holidays)
    let proxUtil = new Date(hoje);
    proxUtil.setDate(proxUtil.getDate() + 1);
    let attempts = 0;
    while (!isDiaUtil(proxUtil, cal) && attempts < 14) {
      proxUtil.setDate(proxUtil.getDate() + 1);
      attempts++;
    }
    if (proxUtil.getTime() !== amanha.getTime()) {
      options.push({ label: 'Próx. dia útil', date: proxUtil });
    }

    return options;
  }, [hojeStr, cal]);

  // Load capacity and load for selected date
  useEffect(() => {
    if (!selectedDate || !pedido) return;
    const ds = selectedDate.toISOString().slice(0, 10);
    setLoadingCarga(true);

    const loadData = async () => {
      // Get capacity override for that day
      const { data: capDia } = await supabase
        .from('pcp_capacidade_diaria')
        .select('capacidade_sintetico, capacidade_tecido, capacidade_total')
        .eq('data', ds)
        .maybeSingle();

      const cap = capDia
        ? { sintetico: capDia.capacidade_sintetico, tecido: capDia.capacidade_tecido, total: capDia.capacidade_total }
        : capacidadePadrao;
      setCapacidadeDia(cap);

      // Get scheduled orders for that day
      const field = tipo === 'inicio' ? 'programado_inicio_data' : 'programado_conclusao_data';
      const { data: ordens } = await supabase
        .from('ordens_producao')
        .select('id, tipo_produto, pedidos!inner(id)')
        .eq(field, ds)
        .not('status', 'eq', 'CANCELADA');

      const pedidoIds = (ordens || []).map((o: any) => o.pedidos.id);
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

        for (const o of (ordens || [])) {
          const qty = qtdMap[(o as any).pedidos.id] || 0;
          if (o.tipo_produto === 'SINTETICO') sintetico += qty;
          else if (o.tipo_produto === 'TECIDO') tecido += qty;
        }
      }

      setCargaDia({ sintetico, tecido, total: sintetico + tecido });
      setLoadingCarga(false);
    };

    loadData();
  }, [selectedDate, pedido, tipo, capacidadePadrao]);

  // Find best day with available capacity
  const findMelhorDia = async () => {
    if (!pedido) return;
    setMelhorDiaLoading(true);

    const pecas = pedido.quantidade_itens;
    const tipoKey = pedido.tipo_produto === 'TECIDO' ? 'tecido' : 'sintetico';
    const field = tipo === 'inicio' ? 'programado_inicio_data' : 'programado_conclusao_data';

    // Check next 30 business days
    let checkDate = new Date(hoje);
    for (let i = 0; i < 30; i++) {
      if (!isDiaUtil(checkDate, cal)) {
        checkDate.setDate(checkDate.getDate() + 1);
        continue;
      }

      const ds = checkDate.toISOString().slice(0, 10);

      // Get capacity
      const { data: capDia } = await supabase
        .from('pcp_capacidade_diaria')
        .select('capacidade_sintetico, capacidade_tecido, capacidade_total')
        .eq('data', ds)
        .maybeSingle();

      const cap = capDia
        ? { sintetico: capDia.capacidade_sintetico, tecido: capDia.capacidade_tecido, total: capDia.capacidade_total }
        : capacidadePadrao;

      // Get existing load
      const { data: ordens } = await supabase
        .from('ordens_producao')
        .select('id, tipo_produto, pedidos!inner(id)')
        .eq(field, ds)
        .not('status', 'eq', 'CANCELADA');

      const pedidoIds = (ordens || []).map((o: any) => o.pedidos.id);
      let cargaTipo = 0;

      if (pedidoIds.length > 0) {
        const { data: itens } = await supabase
          .from('pedido_itens')
          .select('pedido_id, quantidade, categoria_produto, descricao_produto')
          .in('pedido_id', pedidoIds);

        for (const item of (itens || [])) {
          const cat = (item.categoria_produto || '').toUpperCase();
          const desc = (item.descricao_produto || '').toUpperCase();
          if (cat === 'ADICIONAIS' || desc.includes('ADICIONAL')) continue;

          const ordem = (ordens || []).find((o: any) => o.pedidos.id === item.pedido_id);
          if (ordem && ordem.tipo_produto?.toUpperCase() === tipoKey.toUpperCase()) {
            cargaTipo += item.quantidade;
          }
        }
      }

      const saldo = cap[tipoKey] - cargaTipo;
      if (saldo >= pecas) {
        setSelectedDate(new Date(ds + 'T00:00:00'));
        setMelhorDiaLoading(false);
        return;
      }

      checkDate.setDate(checkDate.getDate() + 1);
    }

    setMelhorDiaLoading(false);
  };

  if (!pedido) return null;

  const tipoKey = pedido.tipo_produto === 'TECIDO' ? 'tecido' : 'sintetico';
  const novaCarga = cargaDia[tipoKey] + pedido.quantidade_itens;
  const capTipo = capacidadeDia[tipoKey];
  const excedido = novaCarga > capTipo && capTipo > 0;
  const saldoFinal = capTipo - novaCarga;
  const cargaPct = capTipo > 0 ? Math.min((novaCarga / capTipo) * 100, 100) : 0;

  const handleConfirm = () => {
    if (!selectedDate || !pedido) return;
    const ds = selectedDate.toISOString().slice(0, 10);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4 text-primary" />
            Programar {tipo === 'inicio' ? 'Início' : 'Conclusão'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {pedido.api_venda_id || pedido.numero_pedido} — {pedido.cliente_nome}
          </DialogDescription>
        </DialogHeader>

        {/* Order info */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <Badge className={`text-[10px] px-1.5 py-0 ${TIPO_PRODUTO_BADGE[pedido.tipo_produto || ''] || ''}`}>
              {TIPO_PRODUTO_LABELS[pedido.tipo_produto || ''] || pedido.tipo_produto}
            </Badge>
            <span className="text-muted-foreground">{pedido.quantidade_itens} peças</span>
            {pedido.data_previsao_entrega && (
              <span className="text-muted-foreground">
                Entrega: {format(new Date(pedido.data_previsao_entrega + 'T00:00:00'), 'dd/MM/yyyy')}
              </span>
            )}
          </div>

          {/* Quick dates */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Data rápida</span>
            <div className="flex gap-2 flex-wrap">
              {quickDates.map((qd) => (
                <Button
                  key={qd.label}
                  size="sm"
                  variant={selectedDate?.toISOString().slice(0, 10) === qd.date.toISOString().slice(0, 10) ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => { setSelectedDate(qd.date); setShowCalendar(false); }}
                >
                  {qd.label} ({format(qd.date, 'dd/MM')})
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setShowCalendar(!showCalendar)}
              >
                <CalendarIcon className="h-3 w-3 mr-1" />
                Escolher
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-primary"
                onClick={findMelhorDia}
                disabled={melhorDiaLoading}
              >
                {melhorDiaLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                Melhor dia
              </Button>
            </div>
          </div>

          {/* Calendar */}
          {showCalendar && (
            <div className="border rounded-md p-1">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => { if (d) { setSelectedDate(d); setShowCalendar(false); } }}
                disabled={disableDate}
                locale={ptBR}
                className={cn("p-3 pointer-events-auto")}
              />
            </div>
          )}

          {/* Capacity preview */}
          {selectedDate && (
            <div className="border rounded-md p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Capacidade em {format(selectedDate, 'dd/MM/yyyy')}</span>
                <Badge variant="outline" className="text-[10px]">
                  {TIPO_PRODUTO_LABELS[pedido.tipo_produto || ''] || pedido.tipo_produto}
                </Badge>
              </div>

              {loadingCarga ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando carga...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-2 bg-background rounded">
                      <div className="text-muted-foreground">Capacidade</div>
                      <div className="font-semibold">{capTipo}</div>
                    </div>
                    <div className="text-center p-2 bg-background rounded">
                      <div className="text-muted-foreground">Carga atual</div>
                      <div className="font-semibold">{cargaDia[tipoKey]}</div>
                    </div>
                    <div className={`text-center p-2 rounded ${excedido ? 'bg-destructive/10' : 'bg-background'}`}>
                      <div className="text-muted-foreground">Saldo final</div>
                      <div className={`font-semibold ${excedido ? 'text-destructive' : 'text-foreground'}`}>{saldoFinal}</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {cargaDia[tipoKey]} existente + {pedido.quantidade_itens} novo = {novaCarga}
                      </span>
                      {excedido && <AlertTriangle className="h-3 w-3 text-destructive" />}
                    </div>
                    <Progress value={cargaPct} className={`h-2 ${excedido ? '[&>div]:bg-destructive' : ''}`} />
                  </div>

                  {excedido && (
                    <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/5 rounded p-2">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      Capacidade excedida! A carga ficará acima do limite configurado.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedDate || loadingCarga}
            className={tipo === 'inicio' ? '' : 'bg-emerald-600 hover:bg-emerald-700'}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1" />
            Confirmar {tipo === 'inicio' ? 'Início' : 'Conclusão'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
