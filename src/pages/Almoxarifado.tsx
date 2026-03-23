import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader2, Search, CheckCircle2, Package, Store, LayoutGrid, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  requerSeparacaoAlmoxarifado,
  parseItemAttributes,
  type ParsedItemAttributes,
} from '@/lib/almoxarifado';
import AlmoxProducaoMode from '@/components/almoxarifado/AlmoxProducaoMode';

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

interface AlmoxVenda {
  pedido_id: string;
  api_venda_id: string;
  cliente_nome: string;
  data_previsao_entrega: string | null;
  status_prazo: string | null;
  fivelas_separadas: boolean;
  origem: 'fivela' | 'solicitacao' | 'ambos';
  itens: AlmoxItem[];
}

export default function AlmoxarifadoPage() {
  const { profile } = useAuth();
  const [vendas, setVendas] = useState<AlmoxVenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDENTE');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'producao'>('cards');

  useEffect(() => { fetchVendas(); }, []);

  const fetchVendas = async () => {
    setLoading(true);

    // ── Fonte A: Pedidos "Em Produção" com itens que requerem separação ──
    const { data: pedidosA } = await supabase
      .from('pedidos')
      .select('id, api_venda_id, cliente_nome, data_previsao_entrega, status_prazo, status_atual, status_api, fivelas_separadas')
      .eq('status_api', 'Em Produção')
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
      // Use new detection: requerSeparacaoAlmoxarifado
      const itensRequerem = pedidoItens.filter(i =>
        requerSeparacaoAlmoxarifado(i.descricao_produto, i.categoria_produto)
      );
      if (itensRequerem.length === 0) continue;

      mapA.set(p.id, {
        pedido_id: p.id,
        api_venda_id: p.api_venda_id || '—',
        cliente_nome: p.cliente_nome,
        data_previsao_entrega: p.data_previsao_entrega,
        status_prazo: p.status_prazo,
        fivelas_separadas: (p as any).fivelas_separadas || false,
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
        });
      }
    }

    setVendas(Array.from(mapA.values()));
    setLoading(false);
  };

  const handleConfirmarSeparacao = async (venda: AlmoxVenda) => {
    if (!profile) return;
    try {
      await supabase.from('pedidos').update({
        fivelas_separadas: true,
        fivelas_separadas_em: new Date().toISOString(),
      } as any).eq('id', venda.pedido_id);

      const solIds = venda.itens.filter(i => i.solicitacao_id).map(i => i.solicitacao_id!);
      if (solIds.length > 0) {
        await supabase.from('solicitacoes_almoxarifado').update({
          status: 'ATENDIDO',
          atendido_por: profile.id,
          atendido_em: new Date().toISOString(),
        }).in('id', solIds);
      }

      await supabase.from('pedido_historico').insert({
        pedido_id: venda.pedido_id,
        usuario_id: profile.id,
        tipo_acao: 'COMENTARIO' as any,
        observacao: `Fivelas separadas pelo almoxarifado — ${profile.nome}`,
      });

      toast.success(`Separação confirmada — Venda #${venda.api_venda_id}`);
      fetchVendas();
    } catch {
      toast.error('Erro ao confirmar separação');
    }
  };

  if (!profile || !['admin', 'gestor', 'almoxarifado'].includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const getCardUrgencia = (v: AlmoxVenda) => {
    if (!v.data_previsao_entrega) return { order: 3, bg: '', text: '' };
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const entrega = new Date(v.data_previsao_entrega + 'T00:00:00');
    const dias = Math.ceil((entrega.getTime() - hoje.getTime()) / 86400000);
    if (dias < 0) return { order: 0, bg: 'bg-destructive text-destructive-foreground', text: `${Math.abs(dias)}d atrasado` };
    if (dias <= 3) return { order: 1, bg: 'bg-[hsl(var(--warning))] text-white', text: dias === 0 ? 'Hoje' : `${dias}d restantes` };
    return { order: 2, bg: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]', text: `${dias}d restantes` };
  };

  const filtered = vendas.filter(v => {
    if (filter === 'PENDENTE' && v.fivelas_separadas) return false;
    if (filter === 'SEPARADO' && !v.fivelas_separadas) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!v.api_venda_id.toLowerCase().includes(q) && !v.cliente_nome.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const uA = getCardUrgencia(a);
    const uB = getCardUrgencia(b);
    if (uA.order !== uB.order) return uA.order - uB.order;
    const dA = a.data_previsao_entrega || '9999-12-31';
    const dB = b.data_previsao_entrega || '9999-12-31';
    return dA.localeCompare(dB);
  });

  const origemBadge = (origem: string) => {
    if (origem === 'solicitacao') return <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-600 border-purple-500/30"><Store className="h-3 w-3 mr-1" />Solicitação Loja</Badge>;
    if (origem === 'ambos') return <Badge variant="outline" className="text-[10px] bg-blue-500/15 text-blue-600 border-blue-500/30">Fivelas + Loja</Badge>;
    return null;
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Separação — Almoxarifado</h1>
        <div className="flex items-center gap-3">
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as 'cards' | 'producao')}>
            <ToggleGroupItem value="cards" aria-label="Modo Cards" className="gap-1.5 text-xs px-3">
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </ToggleGroupItem>
            <ToggleGroupItem value="producao" aria-label="Modo Produção" className="gap-1.5 text-xs px-3">
              <ListOrdered className="h-3.5 w-3.5" /> Produção
            </ToggleGroupItem>
          </ToggleGroup>
          <Badge variant="outline" className="text-sm py-1 px-3">{filtered.length} vendas</Badge>
        </div>
      </div>

      {viewMode === 'producao' ? (
        <AlmoxProducaoMode vendas={vendas} onConfirmar={handleConfirmarSeparacao} />
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar venda ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PENDENTE">Pendentes</SelectItem>
                <SelectItem value="SEPARADO">Separados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">Nenhuma venda encontrada.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map(v => {
                const urg = getCardUrgencia(v);
                return (
                <Card key={v.pedido_id} className={`shadow-sm overflow-hidden ${!v.fivelas_separadas && urg.bg ? urg.bg : 'border-border/60'}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-bold">{v.api_venda_id}</CardTitle>
                      {v.fivelas_separadas ? (
                        <Badge className="bg-background/80 text-foreground text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Separado
                        </Badge>
                      ) : urg.text ? (
                        <Badge className="bg-background/20 text-inherit border-0 text-xs font-bold">{urg.text}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Pendente</Badge>
                      )}
                    </div>
                    <p className="text-sm opacity-80">{v.cliente_nome}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {v.data_previsao_entrega && (
                        <span className="text-xs opacity-70">
                          Entrega: {format(new Date(v.data_previsao_entrega + 'T00:00:00'), 'dd/MM/yy')}
                        </span>
                      )}
                      {origemBadge(v.origem)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      {v.itens.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-sm py-1 border-t border-current/10">
                          <span className="font-medium truncate flex-1">{item.descricao_produto}</span>
                          <span className="font-bold ml-2 shrink-0">{item.quantidade} un</span>
                        </div>
                      ))}
                    </div>

                    {!v.fivelas_separadas && (
                      <Button variant="secondary" className="w-full min-h-[48px] bg-background/20 hover:bg-background/30 text-inherit font-bold" onClick={() => handleConfirmarSeparacao(v)}>
                        <Package className="h-4 w-4 mr-2" /> Confirmar separação
                      </Button>
                    )}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

