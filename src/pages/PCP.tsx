import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Scissors, AlertTriangle } from 'lucide-react';
import { agruparParaCorte, CutGroupItem } from '@/lib/pcp';
import { CorteGroupCard } from '@/components/pcp/CorteGroupCard';

const PERFIS_PCP = ['supervisor_producao', 'gestor', 'admin'];

const TIPO_KEYWORDS: Record<string, string[]> = {
  SINTETICO: ['CINTO SINTETICO', 'TIRA SINTETICO', 'CINTO SINTÉTICO', 'TIRA SINTÉTICO'],
  TECIDO: ['CINTO TECIDO', 'TIRA TECIDO'],
};

function matchesTipo(descricao: string, tipo: string): boolean {
  const upper = (descricao || '').toUpperCase();
  return (TIPO_KEYWORDS[tipo] || []).some(kw => upper.includes(kw));
}

export default function PCP() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState<CutGroupItem[]>([]);
  const [leadTimeStats, setLeadTimeStats] = useState({ atrasados: 0, atencao: 0, noPrazo: 0 });
  const [filterLarguraSint, setFilterLarguraSint] = useState('all');
  const [filterLarguraTec, setFilterLarguraTec] = useState('all');
  const [janelaDiasSint, setJanelaDiasSint] = useState<number | null>(null);
  const [janelaDiasTec, setJanelaDiasTec] = useState<number | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: ordens } = await supabase
      .from('ordens_producao')
      .select('id, pedido_id, tipo_produto, pedidos!inner(numero_pedido, api_venda_id, cliente_nome, status_prazo, status_atual, data_venda_api, lead_time_preparacao_dias)')
      .in('tipo_produto', ['SINTETICO', 'TECIDO'])
      .in('status', ['EM_ANDAMENTO', 'AGUARDANDO'])
      .eq('pedidos.status_atual', 'EM_PRODUCAO');

    if (!ordens?.length) { setLoading(false); return; }

    const ordensFiltered = ordens;

    const pedidoIds = [...new Set(ordensFiltered.map(o => o.pedido_id))];
    const [itensRes, obsCorteRes] = await Promise.all([
      supabase
        .from('pedido_itens')
        .select('id, pedido_id, descricao_produto, referencia_produto, observacao_producao, quantidade')
        .in('pedido_id', pedidoIds),
      supabase
        .from('pedido_item_obs_corte')
        .select('id, pedido_item_id, observacao, criado_em, lido, lido_em')
    ]);
    const itens = itensRes.data;

    // Map obs_corte by pedido_item_id
    const obsCorteMap = new Map<string, { id: string; observacao: string; criado_em: string; lido: boolean; lido_em: string | null }[]>();
    for (const obs of (obsCorteRes.data || [])) {
      const list = obsCorteMap.get(obs.pedido_item_id) || [];
      list.push({ id: obs.id, observacao: obs.observacao, criado_em: obs.criado_em, lido: obs.lido, lido_em: obs.lido_em });
      obsCorteMap.set(obs.pedido_item_id, list);
    }

    const pedidoTipoMap = new Map<string, { numero_venda: string | null; data_venda: string | null; lead_time_dias: number | null }>();
    for (const o of ordensFiltered) {
      const p = o.pedidos as any;
      const key = `${o.pedido_id}|${o.tipo_produto}`;
      if (p && !pedidoTipoMap.has(key)) {
        pedidoTipoMap.set(key, {
          numero_venda: p.api_venda_id || p.numero_pedido,
          data_venda: p.data_venda_api,
          lead_time_dias: p.lead_time_preparacao_dias,
        });
      }
    }

    const cutItems: CutGroupItem[] = [];
    for (const [key, info] of pedidoTipoMap) {
      const [pedidoId, tipo] = key.split('|');
      for (const i of (itens || []).filter(it => it.pedido_id === pedidoId)) {
        if (matchesTipo(i.descricao_produto, tipo)) {
          cutItems.push({
            id: i.id,
            descricao: i.descricao_produto,
            referencia: i.referencia_produto,
            observacao_producao: i.observacao_producao,
            quantidade: i.quantidade,
            numero_venda: info.numero_venda,
            data_venda: info.data_venda,
            lead_time_dias: info.lead_time_dias,
            tipo_produto: tipo,
            obs_corte: obsCorteMap.get(i.id) || [],
          });
        }
      }
    }

    setAllItems(cutItems);

    const [r1, r2, r3] = await Promise.all([
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'ATRASADO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'ATENCAO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_prazo', 'NO_PRAZO').in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO']),
    ]);
    setLeadTimeStats({ atrasados: r1.count || 0, atencao: r2.count || 0, noPrazo: r3.count || 0 });
    setLoading(false);
  };

  // Separate items by tipo
  const sinteticoItems = useMemo(() => allItems.filter(i => i.tipo_produto === 'SINTETICO'), [allItems]);
  const tecidoItems = useMemo(() => allItems.filter(i => i.tipo_produto === 'TECIDO'), [allItems]);

  const sinteticoGroups = useMemo(() => agruparParaCorte(sinteticoItems, janelaDiasSint), [sinteticoItems, janelaDiasSint]);
  const tecidoGroups = useMemo(() => agruparParaCorte(tecidoItems, janelaDiasTec), [tecidoItems, janelaDiasTec]);

  const largurasSint = useMemo(() => [...new Set(sinteticoGroups.map(g => g.largura))].sort(), [sinteticoGroups]);
  const largurasTec = useMemo(() => [...new Set(tecidoGroups.map(g => g.largura))].sort(), [tecidoGroups]);

  if (!profile || !PERFIS_PCP.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PCP — Planejamento de Produção</h1>
        <p className="text-muted-foreground mt-0.5">Visão consolidada para planejamento de corte e controle de prazos.</p>
      </div>

      {/* Lead time overview */}
      <div className="grid gap-3 grid-cols-3">
        <Card className="border-destructive/30">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-2xl font-bold tabular-nums">{leadTimeStats.atrasados}</p>
            <p className="text-xs text-muted-foreground">Atrasados</p>
          </CardContent>
        </Card>
        <Card className="border-warning/30">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <p className="text-2xl font-bold tabular-nums">{leadTimeStats.atencao}</p>
            <p className="text-xs text-muted-foreground">Atenção</p>
          </CardContent>
        </Card>
        <Card className="border-[hsl(var(--success))]/30">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <Scissors className="h-5 w-5 text-[hsl(var(--success))]" />
            <p className="text-2xl font-bold tabular-nums">{leadTimeStats.noPrazo}</p>
            <p className="text-xs text-muted-foreground">No Prazo</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <CorteGroupCard
            title="Corte — Sintético"
            tipo="SINTETICO"
            groups={sinteticoGroups}
            filterLargura={filterLarguraSint}
            onFilterLarguraChange={setFilterLarguraSint}
            larguras={largurasSint}
            janelaDias={janelaDiasSint}
            onJanelaDiasChange={setJanelaDiasSint}
          />
          <CorteGroupCard
            title="Corte — Tecido"
            tipo="TECIDO"
            groups={tecidoGroups}
            filterLargura={filterLarguraTec}
            onFilterLarguraChange={setFilterLarguraTec}
            larguras={largurasTec}
            janelaDias={janelaDiasTec}
            onJanelaDiasChange={setJanelaDiasTec}
          />
        </div>
      )}
    </div>
  );
}
