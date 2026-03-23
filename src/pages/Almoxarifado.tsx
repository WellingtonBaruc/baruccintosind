import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, CheckCircle2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FivelaVenda {
  pedido_id: string;
  api_venda_id: string;
  cliente_nome: string;
  data_previsao_entrega: string | null;
  status_prazo: string | null;
  fivelas_separadas: boolean;
  itens: {
    id: string;
    descricao_produto: string;
    referencia_produto: string | null;
    quantidade: number;
    observacao_producao: string | null;
  }[];
}

function isFivelaItem(item: any): boolean {
  const desc = (item.descricao_produto || '').toUpperCase();
  const cat = (item.categoria_produto || '').toUpperCase();
  return desc.includes('FIVELA') || desc.includes('PASSANTE') || cat.includes('FIVELA') || cat.includes('AVIAMENTO');
}

export default function AlmoxarifadoPage() {
  const { profile } = useAuth();
  const [vendas, setVendas] = useState<FivelaVenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDENTE');
  const [search, setSearch] = useState('');

  useEffect(() => { fetchVendas(); }, []);

  const fetchVendas = async () => {
    // Fetch pedidos em produção ou aguardando loja that have fivela items
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id, api_venda_id, cliente_nome, data_previsao_entrega, status_prazo, status_atual, status_api, fivelas_separadas')
      .in('status_atual', ['AGUARDANDO_PRODUCAO', 'EM_PRODUCAO', 'AGUARDANDO_LOJA', 'LOJA_VERIFICANDO', 'AGUARDANDO_OP_COMPLEMENTAR', 'AGUARDANDO_ALMOXARIFADO'])
      .order('data_previsao_entrega', { ascending: true });

    if (!pedidos || pedidos.length === 0) { setVendas([]); setLoading(false); return; }

    const pedidoIds = pedidos.map(p => p.id);
    const { data: allItens } = await supabase
      .from('pedido_itens')
      .select('id, pedido_id, descricao_produto, referencia_produto, quantidade, observacao_producao, categoria_produto')
      .in('pedido_id', pedidoIds);

    const result: FivelaVenda[] = [];
    for (const p of pedidos) {
      const pedidoItens = (allItens || []).filter(i => i.pedido_id === p.id);
      const fivelaItens = pedidoItens.filter(isFivelaItem);
      if (fivelaItens.length === 0) continue;

      result.push({
        pedido_id: p.id,
        api_venda_id: p.api_venda_id || '—',
        cliente_nome: p.cliente_nome,
        data_previsao_entrega: p.data_previsao_entrega,
        status_prazo: p.status_prazo,
        fivelas_separadas: (p as any).fivelas_separadas || false,
        itens: fivelaItens.map(i => ({
          id: i.id,
          descricao_produto: i.descricao_produto,
          referencia_produto: i.referencia_produto,
          quantidade: i.quantidade,
          observacao_producao: i.observacao_producao,
        })),
      });
    }

    setVendas(result);
    setLoading(false);
  };

  const handleConfirmarSeparacao = async (venda: FivelaVenda) => {
    if (!profile) return;
    try {
      await supabase.from('pedidos').update({
        fivelas_separadas: true,
        fivelas_separadas_em: new Date().toISOString(),
      } as any).eq('id', venda.pedido_id);

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

  const filtered = vendas.filter(v => {
    if (filter === 'PENDENTE' && v.fivelas_separadas) return false;
    if (filter === 'SEPARADO' && !v.fivelas_separadas) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!v.api_venda_id.toLowerCase().includes(q) && !v.cliente_nome.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const prazoBadge: Record<string, { label: string; cls: string }> = {
    ATRASADO: { label: 'Atrasado', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
    ATENCAO: { label: 'Atenção', cls: 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30' },
    NO_PRAZO: { label: 'No prazo', cls: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' },
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Separação de Fivelas</h1>
        <Badge variant="outline" className="text-sm py-1 px-3">{filtered.length} vendas</Badge>
      </div>

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
        <p className="text-center py-12 text-muted-foreground">Nenhuma venda com fivelas encontrada.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(v => (
            <Card key={v.pedido_id} className="border-border/60 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold">{v.api_venda_id}</CardTitle>
                  {v.fivelas_separadas ? (
                    <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Separado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Pendente</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{v.cliente_nome}</p>
                <div className="flex items-center gap-2 mt-1">
                  {v.data_previsao_entrega && (
                    <span className="text-xs text-muted-foreground">
                      Entrega: {format(new Date(v.data_previsao_entrega + 'T00:00:00'), 'dd/MM/yy')}
                    </span>
                  )}
                  {v.status_prazo && prazoBadge[v.status_prazo] && (
                    <Badge variant="outline" className={`text-[10px] ${prazoBadge[v.status_prazo].cls}`}>
                      {prazoBadge[v.status_prazo].label}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {v.itens.map(item => (
                    <div key={item.id} className="rounded-md border border-border/60 p-2 text-sm">
                      <p className="font-medium">{item.descricao_produto}</p>
                      {item.referencia_produto && <p className="text-xs text-muted-foreground">Ref: {item.referencia_produto}</p>}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs font-medium">{item.quantidade} un</span>
                        {item.observacao_producao && (
                          <span className="text-xs text-muted-foreground italic">"{item.observacao_producao}"</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!v.fivelas_separadas && (
                  <Button className="w-full min-h-[48px]" onClick={() => handleConfirmarSeparacao(v)}>
                    <Package className="h-4 w-4 mr-2" /> Confirmar separação
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
