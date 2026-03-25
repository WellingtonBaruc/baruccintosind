import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, Search, CheckCircle2, Package, Store, Factory,
  Clock, Play, RefreshCw, Bookmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInCalendarDays } from 'date-fns';
import {
  requerSeparacaoAlmoxarifado,
  parseItemAttributes,
  type ParsedItemAttributes,
} from '@/lib/almoxarifado';

/* ── Types ── */
interface AlmoxItem {
  id: string;
  descricao_produto: string;
  referencia_produto: string | null;
  quantidade: number;
  observacao_producao: string | null;
  origem: 'fivela' | 'solicitacao';
  solicitacao_id?: string;
  parsed: ParsedItemAttributes;
}

type SeparacaoStatus = 'A_SEPARAR' | 'EM_SEPARACAO' | 'CONCLUIDO';

interface AlmoxVenda {
  pedido_id: string;
  api_venda_id: string;
  cliente_nome: string;
  data_previsao_entrega: string | null;
  status_prazo: string | null;
  fivelas_separadas: boolean;
  origem: 'fivela' | 'solicitacao' | 'ambos';
  itens: AlmoxItem[];
  /** Local separation status for kanban columns */
  separacao_status: SeparacaoStatus;
  separacao_iniciada_em?: string;
  destino_apos_conclusao?: string;
}

/* ── Helpers ── */
function calcDiasEntrega(dataEntrega: string | null): number {
  if (!dataEntrega) return 999;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const entrega = new Date(dataEntrega + 'T00:00:00');
  return differenceInCalendarDays(entrega, hoje);
}

type Urgencia = 'atrasado' | 'urgente' | 'normal';
function getUrgencia(dias: number): Urgencia {
  if (dias < 0) return 'atrasado';
  if (dias <= 3) return 'urgente';
  return 'normal';
}

const urgenciaHeaderColors: Record<Urgencia, string> = {
  atrasado: 'bg-destructive',
  urgente: 'bg-warning',
  normal: 'bg-success',
};

function origemLabel(origem: string): { icon: React.ReactNode; label: string; className: string } {
  if (origem === 'solicitacao') return {
    icon: <Store className="h-3 w-3" />,
    label: 'Loja',
    className: 'bg-purple-500/15 text-purple-700 border-purple-400/30',
  };
  if (origem === 'ambos') return {
    icon: <Bookmark className="h-3 w-3" />,
    label: 'Produção + Loja',
    className: 'bg-blue-500/15 text-blue-700 border-blue-400/30',
  };
  return {
    icon: <Factory className="h-3 w-3" />,
    label: 'Produção',
    className: 'bg-emerald-500/15 text-emerald-700 border-emerald-400/30',
  };
}

/* ── Main component ── */
export default function AlmoxarifadoPage() {
  const { profile } = useAuth();
  const [vendas, setVendas] = useState<AlmoxVenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<AlmoxVenda | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Local state for in-progress separations (session-only)
  const [emSeparacaoIds, setEmSeparacaoIds] = useState<Set<string>>(new Set());
  const [concluidosHoje, setConcluidosHoje] = useState<Map<string, { destino: string }>>(new Map());

  const fetchVendas = useCallback(async () => {
    setLoading(true);

    // ── Fonte A: Pedidos "Em Produção" com itens que requerem separação ──
    const { data: pedidosA } = await supabase
      .from('pedidos')
      .select('id, api_venda_id, cliente_nome, data_previsao_entrega, status_prazo, status_atual, status_api, fivelas_separadas')
      .in('status_api', ['Em Produção', 'Pedido Enviado'])
      .not('status_atual', 'in', '("HISTORICO","CANCELADO","FINALIZADO_SIMPLIFICA")')
      .order('data_previsao_entrega', { ascending: true });

    const pedidoIdsA = (pedidosA || []).map(p => p.id);
    let allItensA: any[] = [];
    if (pedidoIdsA.length > 0) {
      const { data } = await supabase
        .from('pedido_itens')
        .select('id, pedido_id, descricao_produto, referencia_produto, quantidade, observacao_producao, categoria_produto')
        .in('pedido_id', pedidoIdsA);
      allItensA = data || [];
    }

    const mapA = new Map<string, AlmoxVenda>();
    for (const p of (pedidosA || [])) {
      const pedidoItens = allItensA.filter(i => i.pedido_id === p.id);
      const itensRequerem = pedidoItens.filter(i =>
        requerSeparacaoAlmoxarifado(i.descricao_produto, i.categoria_produto)
      );
      if (itensRequerem.length === 0) continue;

      const statusApi = ((p as any).status_api || '').trim();
      if (statusApi === 'Pedido Enviado') {
        const hasFivelas = itensRequerem.some(i => {
          const desc = (i.descricao_produto || '').toUpperCase();
          const cat = (i.categoria_produto || '').toUpperCase();
          return desc.includes('FIVELA') || desc.includes('PASSANTE') || cat.includes('FIVELA') || cat.includes('AVIAMENTO');
        });
        if (!hasFivelas) continue;
      }

      const isSeparado = (p as any).fivelas_separadas || false;

      mapA.set(p.id, {
        pedido_id: p.id,
        api_venda_id: p.api_venda_id || '—',
        cliente_nome: p.cliente_nome,
        data_previsao_entrega: p.data_previsao_entrega,
        status_prazo: p.status_prazo,
        fivelas_separadas: isSeparado,
        origem: 'fivela',
        itens: itensRequerem.map(i => ({
          id: i.id,
          descricao_produto: i.descricao_produto,
          referencia_produto: i.referencia_produto,
          quantidade: i.quantidade,
          observacao_producao: i.observacao_producao,
          origem: 'fivela' as const,
          parsed: parseItemAttributes(i.descricao_produto, i.categoria_produto),
        })),
        separacao_status: isSeparado ? 'CONCLUIDO' : (emSeparacaoIds.has(p.id) ? 'EM_SEPARACAO' : 'A_SEPARAR'),
      });
    }

    // ── Fonte B: Solicitações da loja (PENDENTE) ──
    const { data: solicitacoes } = await supabase
      .from('solicitacoes_almoxarifado')
      .select('id, pedido_id, descricao, quantidade, status')
      .eq('status', 'PENDENTE');

    const solPedidoIds = [...new Set((solicitacoes || []).map(s => s.pedido_id))];
    let pedidosB: any[] = [];
    if (solPedidoIds.length > 0) {
      const { data } = await supabase
        .from('pedidos')
        .select('id, api_venda_id, cliente_nome, data_previsao_entrega, status_prazo, fivelas_separadas')
        .in('id', solPedidoIds);
      pedidosB = data || [];
    }

    const pedidoBMap = new Map(pedidosB.map(p => [p.id, p]));

    for (const sol of (solicitacoes || [])) {
      const existing = mapA.get(sol.pedido_id);
      const solItem: AlmoxItem = {
        id: sol.id,
        descricao_produto: sol.descricao,
        referencia_produto: null,
        quantidade: sol.quantidade,
        observacao_producao: null,
        origem: 'solicitacao',
        solicitacao_id: sol.id,
        parsed: parseItemAttributes(sol.descricao),
      };

      if (existing) {
        existing.origem = 'ambos';
        existing.itens.push(solItem);
      } else {
        const ped = pedidoBMap.get(sol.pedido_id);
        if (!ped) continue;
        mapA.set(sol.pedido_id, {
          pedido_id: sol.pedido_id,
          api_venda_id: ped.api_venda_id || '—',
          cliente_nome: ped.cliente_nome,
          data_previsao_entrega: ped.data_previsao_entrega,
          status_prazo: ped.status_prazo,
          fivelas_separadas: ped.fivelas_separadas || false,
          origem: 'solicitacao',
          itens: [solItem],
          separacao_status: emSeparacaoIds.has(sol.pedido_id) ? 'EM_SEPARACAO' : 'A_SEPARAR',
        });
      }
    }

    setVendas(Array.from(mapA.values()));
    setLoading(false);
  }, [emSeparacaoIds]);

  useEffect(() => { fetchVendas(); }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchVendas, 30000);
    return () => clearInterval(interval);
  }, [fetchVendas]);

  /* ── Actions ── */
  const handleIniciarSeparacao = (venda: AlmoxVenda) => {
    setEmSeparacaoIds(prev => new Set(prev).add(venda.pedido_id));
    setVendas(prev => prev.map(v =>
      v.pedido_id === venda.pedido_id ? { ...v, separacao_status: 'EM_SEPARACAO' as SeparacaoStatus } : v
    ));
    toast.success(`Separação iniciada — #${venda.api_venda_id}`);
  };

  const handleConcluirSeparacao = async (venda: AlmoxVenda) => {
    if (!profile) return;
    setActionLoading(venda.pedido_id);
    try {
      await supabase.from('pedidos').update({
        fivelas_separadas: true,
        fivelas_separadas_em: new Date().toISOString(),
      } as any).eq('id', venda.pedido_id);

      const solIds = venda.itens.filter(i => i.solicitacao_id).map(i => i.solicitacao_id!);
      if (solIds.length > 0) {
        await supabase.from('solicitacoes_almoxarifado').update({
          status: 'ATENDIDA',
          atendido_por: profile.id,
          atendido_em: new Date().toISOString(),
        }).in('id', solIds);
      }

      // Determine destination
      let destino = 'Separação registrada';
      const { data: pedido } = await supabase
        .from('pedidos')
        .select('status_atual, tipo_fluxo, subtipo_pronta_entrega')
        .eq('id', venda.pedido_id)
        .single();

      if (pedido?.status_atual === 'AGUARDANDO_ALMOXARIFADO') {
        const { data: ops } = await supabase
          .from('ordens_producao')
          .select('status, aprovado_em')
          .eq('pedido_id', venda.pedido_id)
          .gt('sequencia', 1);

        const allOpsDone = !ops || ops.length === 0 || ops.every(o => o.aprovado_em !== null);

        if (allOpsDone) {
          await supabase.from('pedidos').update({ status_atual: 'LOJA_PENDENTE_FINALIZACAO' }).eq('id', venda.pedido_id);
          await supabase.from('pedido_historico').insert({
            pedido_id: venda.pedido_id,
            usuario_id: profile.id,
            tipo_acao: 'TRANSICAO' as any,
            status_anterior: 'AGUARDANDO_ALMOXARIFADO',
            status_novo: 'LOJA_PENDENTE_FINALIZACAO',
            observacao: 'Fivelas separadas e pendências resolvidas. Aguardando finalização pela Loja.',
          });
          destino = 'Enviado para Loja';
        } else {
          await supabase.from('pedidos').update({ status_atual: 'AGUARDANDO_OP_COMPLEMENTAR' }).eq('id', venda.pedido_id);
          await supabase.from('pedido_historico').insert({
            pedido_id: venda.pedido_id,
            usuario_id: profile.id,
            tipo_acao: 'TRANSICAO' as any,
            status_anterior: 'AGUARDANDO_ALMOXARIFADO',
            status_novo: 'AGUARDANDO_OP_COMPLEMENTAR',
            observacao: 'Fivelas separadas. Aguardando OP complementar.',
          });
          destino = 'Aguardando OP complementar';
        }
      } else {
        const isLojaFlow = pedido?.tipo_fluxo === 'PRONTA_ENTREGA' || !!pedido?.subtipo_pronta_entrega;
        const notAlreadyAdvanced = !['AGUARDANDO_COMERCIAL', 'VALIDADO_COMERCIAL', 'AGUARDANDO_FINANCEIRO', 'VALIDADO_FINANCEIRO',
          'LIBERADO_LOGISTICA', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE', 'CANCELADO', 'FINALIZADO_SIMPLIFICA', 'HISTORICO',
          'LOJA_PENDENTE_FINALIZACAO', 'AGUARDANDO_CIENCIA_COMERCIAL'].includes(pedido?.status_atual || '');

        if (isLojaFlow && notAlreadyAdvanced) {
          await supabase.from('pedidos').update({ status_atual: 'LOJA_PENDENTE_FINALIZACAO' }).eq('id', venda.pedido_id);
          await supabase.from('pedido_historico').insert({
            pedido_id: venda.pedido_id,
            usuario_id: profile.id,
            tipo_acao: 'TRANSICAO' as any,
            status_anterior: pedido?.status_atual || '',
            status_novo: 'LOJA_PENDENTE_FINALIZACAO',
            observacao: `Fivelas separadas pelo almoxarifado. Retornando para Loja finalizar — ${profile.nome}`,
          });
          destino = 'Enviado para Loja';
        } else {
          await supabase.from('pedido_historico').insert({
            pedido_id: venda.pedido_id,
            usuario_id: profile.id,
            tipo_acao: 'COMENTARIO' as any,
            observacao: `Fivelas separadas pelo almoxarifado — ${profile.nome}`,
          });
          destino = 'Separação registrada';
        }
      }

      // Move to concluídos
      setEmSeparacaoIds(prev => {
        const next = new Set(prev);
        next.delete(venda.pedido_id);
        return next;
      });
      setConcluidosHoje(prev => new Map(prev).set(venda.pedido_id, { destino }));
      setVendas(prev => prev.map(v =>
        v.pedido_id === venda.pedido_id
          ? { ...v, separacao_status: 'CONCLUIDO' as SeparacaoStatus, fivelas_separadas: true, destino_apos_conclusao: destino }
          : v
      ));

      toast.success(`Separação concluída — #${venda.api_venda_id} → ${destino}`);
    } catch {
      toast.error('Erro ao concluir separação');
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  /* ── Filter & sort ── */
  const filteredVendas = useMemo(() => {
    let list = vendas;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.api_venda_id.toLowerCase().includes(q) || v.cliente_nome.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      const dA = calcDiasEntrega(a.data_previsao_entrega);
      const dB = calcDiasEntrega(b.data_previsao_entrega);
      return dA - dB;
    });
  }, [vendas, search]);

  const aSeparar = filteredVendas.filter(v => v.separacao_status === 'A_SEPARAR');
  const emSeparacao = filteredVendas.filter(v => v.separacao_status === 'EM_SEPARACAO');
  const concluidos = filteredVendas.filter(v => v.separacao_status === 'CONCLUIDO');

  /* ── KPIs ── */
  const kpiAtrasados = aSeparar.filter(v => calcDiasEntrega(v.data_previsao_entrega) < 0).length
    + emSeparacao.filter(v => calcDiasEntrega(v.data_previsao_entrega) < 0).length;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Central de Separação</h1>
        <div className="flex items-center gap-2">
          <div className="relative min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-9" placeholder="Buscar venda ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={fetchVendas} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Package className="h-5 w-5 text-warning" />} label="A Separar" value={aSeparar.length} />
        <KpiCard icon={<Play className="h-5 w-5 text-primary" />} label="Em Separação" value={emSeparacao.length} />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Concluídos Hoje" value={concluidos.length} />
        <KpiCard icon={<Clock className="h-5 w-5 text-destructive" />} label="Atrasados" value={kpiAtrasados} alert={kpiAtrasados > 0} />
      </div>

      {/* 3-column Kanban */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column: A SEPARAR */}
        <KanbanColumn title="A Separar" count={aSeparar.length} colorClass="bg-warning/10 border-warning/30">
          {aSeparar.length === 0 ? (
            <EmptyColumn text="Nenhum pedido pendente" />
          ) : aSeparar.map(v => (
            <AlmoxCard key={v.pedido_id} venda={v} actionLoading={actionLoading}>
              <Button
                className="w-full min-h-[44px] gap-2"
                variant="outline"
                onClick={() => handleIniciarSeparacao(v)}
              >
                <Play className="h-4 w-4" /> Iniciar Separação
              </Button>
            </AlmoxCard>
          ))}
        </KanbanColumn>

        {/* Column: EM SEPARAÇÃO */}
        <KanbanColumn title="Em Separação" count={emSeparacao.length} colorClass="bg-primary/10 border-primary/30">
          {emSeparacao.length === 0 ? (
            <EmptyColumn text="Nenhum pedido em andamento" />
          ) : emSeparacao.map(v => (
            <AlmoxCard key={v.pedido_id} venda={v} actionLoading={actionLoading}>
              <Button
                className="w-full min-h-[44px] gap-2"
                onClick={() => setConfirmDialog(v)}
                disabled={actionLoading === v.pedido_id}
              >
                {actionLoading === v.pedido_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Concluir Separação
              </Button>
            </AlmoxCard>
          ))}
        </KanbanColumn>

        {/* Column: CONCLUÍDO */}
        <KanbanColumn title="Concluído" count={concluidos.length} colorClass="bg-success/10 border-success/30">
          {concluidos.length === 0 ? (
            <EmptyColumn text="Nenhum concluído hoje" />
          ) : concluidos.map(v => {
            const dest = v.destino_apos_conclusao || concluidosHoje.get(v.pedido_id)?.destino || 'Separado';
            return (
              <AlmoxCard key={v.pedido_id} venda={v} actionLoading={actionLoading}>
                <div className="flex items-center gap-2 text-sm font-medium text-success py-2 justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                  {dest}
                </div>
              </AlmoxCard>
            );
          })}
        </KanbanColumn>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar separação?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a concluir a separação do pedido{' '}
              <strong>#{confirmDialog?.api_venda_id}</strong> ({confirmDialog?.cliente_nome}).
              <br /><br />
              Esta ação não pode ser desfeita. Confirme que todos os itens foram separados corretamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDialog && handleConcluirSeparacao(confirmDialog)}
              disabled={!!actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Sub-components ── */

function KpiCard({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: number; alert?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 bg-card ${alert ? 'border-destructive/50' : 'border-border'}`}>
      {icon}
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function KanbanColumn({ title, count, colorClass, children }: {
  title: string; count: number; colorClass: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${colorClass} min-h-[300px]`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </div>
      <div className="p-3 space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function EmptyColumn({ text }: { text: string }) {
  return <p className="text-center py-8 text-sm text-muted-foreground">{text}</p>;
}

function AlmoxCard({ venda, actionLoading, children }: {
  venda: AlmoxVenda; actionLoading: string | null; children: React.ReactNode;
}) {
  const dias = calcDiasEntrega(venda.data_previsao_entrega);
  const urgencia = getUrgencia(dias);
  const orig = origemLabel(venda.origem);

  return (
    <div className="bg-card rounded-md border border-border shadow-sm overflow-hidden">
      {/* Colored header strip */}
      <div className={`${urgenciaHeaderColors[urgencia]} px-3 py-2 text-primary-foreground`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">{venda.api_venda_id}</span>
          <span className="text-xs font-medium opacity-90">
            {dias < 0 ? `${Math.abs(dias)}d atrasado` : dias === 0 ? 'Hoje' : `${dias}d`}
          </span>
        </div>
        <p className="text-xs opacity-80 truncate">{venda.cliente_nome}</p>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        {/* Origin badge */}
        <Badge variant="outline" className={`text-[10px] gap-1 ${orig.className}`}>
          {orig.icon} {orig.label}
        </Badge>

        {/* Items */}
        <div className="space-y-1">
          {venda.itens.map(item => (
            <div key={item.id} className="flex items-center justify-between text-sm py-0.5">
              <span className="text-foreground truncate flex-1">{item.descricao_produto}</span>
              <span className="font-bold text-foreground ml-2 shrink-0">{item.quantidade}</span>
            </div>
          ))}
        </div>

        {venda.data_previsao_entrega && (
          <p className="text-[10px] text-muted-foreground">
            Entrega: {format(new Date(venda.data_previsao_entrega + 'T00:00:00'), 'dd/MM/yy')}
          </p>
        )}

        {/* Action slot */}
        {children}
      </div>
    </div>
  );
}
