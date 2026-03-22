import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { classificarProduto, TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE, STATUS_PRAZO_CONFIG } from '@/lib/pcp';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Monitor } from 'lucide-react';

const ETAPAS_SINTETICO = ['Corte', 'Preparação', 'Montagem', 'Embalagem', 'Produção Finalizada'];
const ETAPAS_TECIDO = ['Conferência', 'Fusionagem', 'Colagem / Viração', 'Finalização', 'Concluído'];

interface KanbanCard {
  id: string;
  numero_pedido: string;
  cliente_nome: string;
  tipo_produto: string | null;
  operador: string;
  status_prazo: string;
  quantidade: number;
}

interface EtapaColumn {
  nome: string;
  cards: KanbanCard[];
}

export default function PainelTV() {
  const [loading, setLoading] = useState(true);
  const [sinteticoCols, setSinteticoCols] = useState<EtapaColumn[]>([]);
  const [tecidoCols, setTecidoCols] = useState<EtapaColumn[]>([]);
  const [resumo, setResumo] = useState({ total: 0, sintetico: 0, tecido: 0, fivela: 0, atrasado: 0, atencao: 0, noPrazo: 0 });

  const fetchData = useCallback(async () => {
    // Get all active orders with their current etapa
    const { data: ordens } = await supabase
      .from('ordens_producao')
      .select(`
        id, tipo_produto, status,
        pedidos!inner(numero_pedido, cliente_nome, status_prazo, status_api),
        pipeline_producao(nome)
      `)
      .neq('pedidos.status_api', 'Finalizado')
      .in('status', ['AGUARDANDO', 'EM_ANDAMENTO']);

    if (!ordens) { setLoading(false); return; }

    // Get etapas for all orders
    const orderIds = ordens.map(o => o.id);
    const { data: etapas } = await supabase
      .from('op_etapas')
      .select('ordem_id, nome_etapa, status, operador_id, usuarios(nome)')
      .in('ordem_id', orderIds.length > 0 ? orderIds : ['none'])
      .eq('status', 'EM_ANDAMENTO');

    // Get item counts per pedido
    const pedidoIds = [...new Set(ordens.map((o: any) => o.pedidos?.id || o.pedido_id))].filter(Boolean);

    const etapaMap: Record<string, { nome: string; operador: string }> = {};
    for (const e of (etapas || [])) {
      etapaMap[e.ordem_id] = { nome: e.nome_etapa, operador: (e.usuarios as any)?.nome || '' };
    }

    // Build kanban
    const sinteticoMap: Record<string, KanbanCard[]> = {};
    const tecidoMap: Record<string, KanbanCard[]> = {};
    ETAPAS_SINTETICO.forEach(e => sinteticoMap[e] = []);
    ETAPAS_TECIDO.forEach(e => tecidoMap[e] = []);

    let totalCount = 0, sinCount = 0, tecCount = 0, fivCount = 0, atrasado = 0, atencao = 0, noPrazo = 0;

    for (const o of ordens) {
      const ped = o.pedidos as any;
      const etapaInfo = etapaMap[o.id];
      const etapaNome = etapaInfo?.nome || '—';
      const prazo = ped.status_prazo || 'NO_PRAZO';

      totalCount++;
      if (o.tipo_produto === 'SINTETICO') sinCount++;
      else if (o.tipo_produto === 'TECIDO') tecCount++;
      else if (o.tipo_produto === 'FIVELA_COBERTA') fivCount++;

      if (prazo === 'ATRASADO') atrasado++;
      else if (prazo === 'ATENCAO') atencao++;
      else noPrazo++;

      const card: KanbanCard = {
        id: o.id,
        numero_pedido: ped.numero_pedido,
        cliente_nome: ped.cliente_nome,
        tipo_produto: o.tipo_produto,
        operador: etapaInfo?.operador || '',
        status_prazo: prazo,
        quantidade: 0,
      };

      if (o.tipo_produto === 'SINTETICO' && sinteticoMap[etapaNome]) {
        sinteticoMap[etapaNome].push(card);
      } else if (o.tipo_produto === 'TECIDO' && tecidoMap[etapaNome]) {
        tecidoMap[etapaNome].push(card);
      }
    }

    setSinteticoCols(ETAPAS_SINTETICO.map(e => ({ nome: e, cards: sinteticoMap[e] })));
    setTecidoCols(ETAPAS_TECIDO.map(e => ({ nome: e, cards: tecidoMap[e] })));
    setResumo({ total: totalCount, sintetico: sinCount, tecido: tecCount, fivela: fivCount, atrasado, atencao, noPrazo });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const prazoColor = (prazo: string) => {
    if (prazo === 'ATRASADO') return 'border-l-4 border-l-red-500 bg-red-500/5';
    if (prazo === 'ATENCAO') return 'border-l-4 border-l-yellow-500 bg-yellow-500/5';
    return 'border-l-4 border-l-green-500 bg-green-500/5';
  };

  if (loading) return <div className="flex justify-center items-center min-h-screen"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Monitor className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Painel de Produção</h1>
        </div>
        <span className="text-sm text-muted-foreground">Atualiza a cada 60s</span>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="border-border/60"><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold">{resumo.total}</p>
          <p className="text-xs text-muted-foreground">Total Pedidos</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{resumo.sintetico}</p>
          <p className="text-xs text-muted-foreground">Sintético</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-orange-600">{resumo.tecido}</p>
          <p className="text-xs text-muted-foreground">Tecido</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{resumo.fivela}</p>
          <p className="text-xs text-muted-foreground">Fivela</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-red-600">{resumo.atrasado}</p>
          <p className="text-xs text-muted-foreground">Atrasados</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-yellow-600">{resumo.atencao}</p>
          <p className="text-xs text-muted-foreground">Atenção</p>
        </CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{resumo.noPrazo}</p>
          <p className="text-xs text-muted-foreground">No Prazo</p>
        </CardContent></Card>
      </div>

      {/* Kanban Sintético */}
      <div>
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <Badge className="bg-purple-500/15 text-purple-700 border-purple-200">Sintético</Badge>
          Linha de Produção
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {sinteticoCols.map(col => (
            <div key={col.nome} className="space-y-2">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                <p className="font-semibold text-sm">{col.nome}</p>
                <p className="text-xs text-muted-foreground">{col.cards.length} pedidos</p>
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {col.cards.map(card => (
                  <Card key={card.id} className={`${prazoColor(card.status_prazo)} shadow-sm`}>
                    <CardContent className="p-3 space-y-1">
                      <p className="font-bold text-sm">{card.numero_pedido}</p>
                      <p className="text-xs text-muted-foreground truncate">{card.cliente_nome}</p>
                      {card.operador && <p className="text-xs">👤 {card.operador}</p>}
                    </CardContent>
                  </Card>
                ))}
                {col.cards.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Vazio</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kanban Tecido */}
      <div>
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <Badge className="bg-orange-500/15 text-orange-700 border-orange-200">Tecido</Badge>
          Linha de Produção
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {tecidoCols.map(col => (
            <div key={col.nome} className="space-y-2">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                <p className="font-semibold text-sm">{col.nome}</p>
                <p className="text-xs text-muted-foreground">{col.cards.length} pedidos</p>
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {col.cards.map(card => (
                  <Card key={card.id} className={`${prazoColor(card.status_prazo)} shadow-sm`}>
                    <CardContent className="p-3 space-y-1">
                      <p className="font-bold text-sm">{card.numero_pedido}</p>
                      <p className="text-xs text-muted-foreground truncate">{card.cliente_nome}</p>
                      {card.operador && <p className="text-xs">👤 {card.operador}</p>}
                    </CardContent>
                  </Card>
                ))}
                {col.cards.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Vazio</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
