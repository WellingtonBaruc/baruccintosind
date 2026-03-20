import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_PEDIDO_CONFIG, iniciarVerificacaoLoja } from '@/lib/producao';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, Clock, Package, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const PERFIS_LOJA = ['loja', 'admin', 'gestor'];
const STATUS_LOJA = ['AGUARDANDO_LOJA', 'LOJA_VERIFICANDO', 'AGUARDANDO_OP_COMPLEMENTAR', 'AGUARDANDO_ALMOXARIFADO'];

interface PedidoLoja {
  id: string;
  numero_pedido: string;
  cliente_nome: string;
  status_atual: string;
  tipo_fluxo: string | null;
  subtipo_pronta_entrega: string | null;
  criado_em: string;
  valor_liquido: number;
  qtd_itens?: number;
}

export default function FilaLoja() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoLoja[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => { fetchPedidos(); }, []);

  const fetchPedidos = async () => {
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .in('status_atual', STATUS_LOJA)
      .order('criado_em', { ascending: true });

    if (data) {
      const withItens = await Promise.all(
        data.map(async (p: any) => {
          const { count } = await supabase.from('pedido_itens').select('*', { count: 'exact', head: true }).eq('pedido_id', p.id);
          return { ...p, qtd_itens: count || 0 };
        })
      );
      setPedidos(withItens);
    }
    setLoading(false);
  };

  if (!profile || !PERFIS_LOJA.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleIniciarVerificacao = async (pedidoId: string) => {
    try {
      await iniciarVerificacaoLoja(pedidoId, profile.id);
      toast.success('Verificação iniciada!');
      navigate(`/loja/verificar/${pedidoId}`);
    } catch {
      toast.error('Erro ao iniciar verificação.');
    }
  };

  const filtered = pedidos.filter(p => {
    const matchSearch = search === '' ||
      p.numero_pedido.toLowerCase().includes(search.toLowerCase()) ||
      p.cliente_nome.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status_atual === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fila da Loja</h1>
        <p className="text-muted-foreground mt-0.5">Pedidos aguardando verificação e expedição.</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar pedido ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS_LOJA.map(s => {
              const cfg = STATUS_PEDIDO_CONFIG[s];
              return <SelectItem key={s} value={s}>{cfg?.label || s}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Nenhum pedido na fila da loja.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tempo em espera</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const cfg = STATUS_PEDIDO_CONFIG[p.status_atual] || { label: p.status_atual, color: 'bg-muted text-muted-foreground' };
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.numero_pedido}</TableCell>
                      <TableCell className="text-muted-foreground">{p.cliente_nome}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" /> {p.qtd_itens}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </TableCell>
                      <TableCell>
                        <Badge className={`font-normal ${cfg.color}`}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(p.criado_em), { locale: ptBR, addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {p.status_atual === 'AGUARDANDO_LOJA' ? (
                          <Button size="sm" onClick={() => handleIniciarVerificacao(p.id)}>
                            Iniciar verificação
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => navigate(`/loja/verificar/${p.id}`)}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
