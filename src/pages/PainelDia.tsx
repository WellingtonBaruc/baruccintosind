import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE, STATUS_PRAZO_CONFIG } from '@/lib/pcp';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface PainelRow {
  id: string;
  numero_pedido: string;
  api_venda_id: string | null;
  cliente_nome: string;
  tipo_produto: string | null;
  status_prazo: string | null;
  status_atual: string;
  data_previsao_entrega: string | null;
  quantidade_itens?: number;
}

const ATENCAO_DIAS = 3;
const calcStatusPrazo = (dataPrevisao: string | null): string => {
  if (!dataPrevisao) return 'NO_PRAZO';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const previsao = new Date(dataPrevisao + 'T00:00:00');
  const diffDias = Math.ceil((previsao.getTime() - hoje.getTime()) / 86400000);
  if (diffDias < 0) return 'ATRASADO';
  return diffDias <= ATENCAO_DIAS ? 'ATENCAO' : 'NO_PRAZO';
};

export default function PainelDia() {
  const [atrasados, setAtrasados] = useState<PainelRow[]>([]);
  const [entregarHoje, setEntregarHoje] = useState<PainelRow[]>([]);
  const [iniciarHoje, setIniciarHoje] = useState<PainelRow[]>([]);
  const [concluidos, setConcluidos] = useState<PainelRow[]>([]);
  const [totalMeta, setTotalMeta] = useState(0);
  const [totalConcluido, setTotalConcluido] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchQtdItens = async (pedidoIds: string[]): Promise<Record<string, number>> => {
    if (pedidoIds.length === 0) return {};
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
    return qtdMap;
  };

  const fetchData = async () => {
    const today = new Date().toISOString().slice(0, 10);

    const statusFinais = ['ENVIADO', 'ENTREGUE', 'FINALIZADO_SIMPLIFICA', 'CANCELADO', 'HISTORICO'];

    // Atrasados
    const { data: atrasadosData } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, api_venda_id, cliente_nome, status_prazo, status_atual, data_previsao_entrega')
      .lt('data_previsao_entrega', today)
      .not('status_api', 'eq', 'Finalizado')
      .not('status_atual', 'in', `(${statusFinais.join(',')})`)
      .order('data_previsao_entrega', { ascending: true });

    // Entregar hoje
    const { data: entrega } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, api_venda_id, cliente_nome, status_prazo, status_atual, data_previsao_entrega')
      .eq('data_previsao_entrega', today)
      .not('status_api', 'eq', 'Finalizado');

    // Iniciar hoje (ordens com data_inicio_pcp = hoje)
    const { data: ordens } = await supabase
      .from('ordens_producao')
      .select('tipo_produto, pedidos!inner(id, numero_pedido, api_venda_id, cliente_nome, status_prazo, status_atual, data_previsao_entrega)')
      .eq('data_inicio_pcp', today);

    const iniciar: PainelRow[] = (ordens || []).map((o: any) => ({
      ...o.pedidos,
      tipo_produto: o.tipo_produto,
    }));

    // Concluídos hoje (ordens concluídas programadas para hoje)
    const { data: concluidosData } = await supabase
      .from('ordens_producao')
      .select('tipo_produto, pedidos!inner(id, numero_pedido, api_venda_id, cliente_nome, status_prazo, status_atual, data_previsao_entrega)')
      .eq('programado_para_hoje', true)
      .eq('data_programacao', today)
      .eq('status', 'CONCLUIDA');

    const concluidosList: PainelRow[] = (concluidosData || []).map((o: any) => ({
      ...o.pedidos,
      tipo_produto: o.tipo_produto,
    }));

    // KPIs
    const { count: metaCount } = await supabase.from('ordens_producao')
      .select('*', { count: 'exact', head: true })
      .eq('programado_para_hoje', true).eq('data_programacao', today);

    const concluidoCount = concluidosList.length;

    // Fetch item quantities for entregarHoje, iniciarHoje and concluidos
    const allPedidoIds = [
      ...(entrega || []).map(p => p.id),
      ...iniciar.map(p => p.id),
      ...concluidosList.map(p => p.id),
    ].filter(Boolean);
    const uniqueIds = [...new Set(allPedidoIds)];
    const qtdMap = await fetchQtdItens(uniqueIds);

    setAtrasados((atrasadosData || []).map(p => ({
      ...p,
      tipo_produto: null,
      status_prazo: 'ATRASADO',
    })));
    setEntregarHoje((entrega || []).map(p => ({
      ...p,
      tipo_produto: null,
      status_prazo: calcStatusPrazo(p.data_previsao_entrega),
      quantidade_itens: qtdMap[p.id] || 0,
    })));
    setIniciarHoje(iniciar.map(p => ({
      ...p,
      status_prazo: calcStatusPrazo(p.data_previsao_entrega),
      quantidade_itens: qtdMap[p.id] || 0,
    })));
    setConcluidos(concluidosList.map(p => ({
      ...p,
      status_prazo: calcStatusPrazo(p.data_previsao_entrega),
      quantidade_itens: qtdMap[p.id] || 0,
    })));
    setTotalMeta(metaCount || 0);
    setTotalConcluido(concluidoCount);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, []);

  const pct = totalMeta > 0 ? Math.round((totalConcluido / totalMeta) * 100) : 0;
  const totalItensEntrega = entregarHoje.reduce((s, p) => s + (p.quantidade_itens || 0), 0);
  const totalItensIniciar = iniciarHoje.reduce((s, p) => s + (p.quantidade_itens || 0), 0);
  const totalItensConcluidos = concluidos.reduce((s, p) => s + (p.quantidade_itens || 0), 0);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Painel do Dia</h1>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60">
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold">{totalMeta}</p>
            <p className="text-sm text-muted-foreground">Meta do dia</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-[hsl(var(--success))]">{totalConcluido}</p>
            <p className="text-sm text-muted-foreground">Concluídos</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-destructive">{atrasados.length}</p>
            <p className="text-sm text-muted-foreground">Atrasados</p>
          </CardContent>
        </Card>
      </div>

      {/* Progresso */}
      {totalMeta > 0 && (
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progresso do dia</span>
              <span className="text-sm text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Atrasados */}
      {atrasados.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-destructive">⚠️ Atrasados ({atrasados.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {atrasados.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div>
                    <span className="font-medium text-sm">{p.api_venda_id || p.numero_pedido}</span>
                    <span className="text-sm text-muted-foreground ml-2">{p.cliente_nome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs font-normal">
                      Prev: {p.data_previsao_entrega ? format(new Date(p.data_previsao_entrega + 'T00:00:00'), 'dd/MM') : '—'}
                    </Badge>
                    <span className="text-sm">{STATUS_PRAZO_CONFIG['ATRASADO']?.icon}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entregar hoje */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Entregar Hoje ({entregarHoje.length})</CardTitle>
            {entregarHoje.length > 0 && (
              <span className="text-xs text-muted-foreground">{totalItensEntrega} itens</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {entregarHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma entrega programada para hoje.</p>
          ) : (
            <div className="space-y-2">
              {entregarHoje.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <span className="font-medium text-sm">{p.api_venda_id || p.numero_pedido}</span>
                    <span className="text-sm text-muted-foreground ml-2">{p.cliente_nome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{p.quantidade_itens || 0} un</span>
                    <span className="text-sm">{STATUS_PRAZO_CONFIG[p.status_prazo || 'NO_PRAZO']?.icon}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Iniciar hoje */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Iniciar Hoje ({iniciarHoje.length})</CardTitle>
            {iniciarHoje.length > 0 && (
              <span className="text-xs text-muted-foreground">{totalItensIniciar} itens</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {iniciarHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum início programado para hoje.</p>
          ) : (
            <div className="space-y-2">
              {iniciarHoje.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <span className="font-medium text-sm">{p.api_venda_id || p.numero_pedido}</span>
                    <span className="text-sm text-muted-foreground ml-2">{p.cliente_nome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{p.quantidade_itens || 0} un</span>
                    {p.tipo_produto && (
                      <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[p.tipo_produto] || ''}`}>
                        {TIPO_PRODUTO_LABELS[p.tipo_produto] || p.tipo_produto}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Concluídos hoje */}
      <Card className="border-[hsl(var(--success))]/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              Concluídos Hoje ({concluidos.length})
            </CardTitle>
            {concluidos.length > 0 && (
              <span className="text-xs text-muted-foreground">{totalItensConcluidos} itens</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {concluidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ordem concluída hoje.</p>
          ) : (
            <div className="space-y-2">
              {concluidos.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 p-3">
                  <div>
                    <span className="font-medium text-sm">{p.api_venda_id || p.numero_pedido}</span>
                    <span className="text-sm text-muted-foreground ml-2">{p.cliente_nome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{p.quantidade_itens || 0} un</span>
                    {p.tipo_produto && (
                      <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[p.tipo_produto] || ''}`}>
                        {TIPO_PRODUTO_LABELS[p.tipo_produto] || p.tipo_produto}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
