import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_ORDEM_CONFIG } from '@/lib/producao';
import { STATUS_PRAZO_CONFIG, TIPO_PRODUTO_LABELS } from '@/lib/pcp';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Loader2, Search, AlertTriangle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PERFIS_PRODUCAO = ['operador_producao', 'supervisor_producao', 'gestor', 'admin'];

interface OrdemView {
  id: string;
  pedido_id: string;
  pipeline_id: string;
  sequencia: number;
  status: string;
  tipo_produto: string | null;
  criado_em: string;
  pedidos: { numero_pedido: string; cliente_nome: string; valor_liquido: number; criado_em: string; status_prazo: string | null; data_previsao_entrega: string | null; api_venda_id: string | null };
  pipeline_producao: { nome: string };
  etapa_atual?: string;
  operador_atual?: string;
}

export default function FilaProducao() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [ordens, setOrdens] = useState<OrdemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('urgencia');

  useEffect(() => {
    fetchOrdens();
  }, []);

  const fetchOrdens = async () => {
    const { data } = await supabase
      .from('ordens_producao')
      .select(`
        *,
        pedidos!inner(numero_pedido, cliente_nome, valor_liquido, criado_em, status_prazo, data_previsao_entrega, api_venda_id),
        pipeline_producao(nome)
      `)
      .order('criado_em', { ascending: false });

    if (data) {
      const ordensWithEtapa = await Promise.all(
        data.map(async (o: any) => {
          const { data: etapa } = await supabase
            .from('op_etapas')
            .select('nome_etapa, operador_id, usuarios(nome)')
            .eq('ordem_id', o.id)
            .eq('status', 'EM_ANDAMENTO')
            .limit(1)
            .maybeSingle();
          return {
            ...o,
            etapa_atual: etapa?.nome_etapa || (o.status === 'CONCLUIDA' ? 'Aguardando aprovação' : '—'),
            operador_atual: (etapa?.usuarios as any)?.nome || '—',
          };
        })
      );
      setOrdens(ordensWithEtapa);
    }
    setLoading(false);
  };

  if (!profile || !PERFIS_PRODUCAO.includes(profile.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  const filtered = ordens.filter(o => {
    const matchSearch = search === '' ||
      o.pedidos.numero_pedido.toLowerCase().includes(search.toLowerCase()) ||
      o.pedidos.cliente_nome.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Sort by urgency
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'urgencia') {
      const prazoOrder: Record<string, number> = { ATRASADO: 0, ATENCAO: 1, NO_PRAZO: 2 };
      const pa = prazoOrder[a.pedidos.status_prazo || 'NO_PRAZO'] ?? 3;
      const pb = prazoOrder[b.pedidos.status_prazo || 'NO_PRAZO'] ?? 3;
      if (pa !== pb) return pa - pb;
    }
    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
  });

  const isDelayed = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    return diff > 4 * 60 * 60 * 1000;
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fila de Produção</h1>
          <p className="text-muted-foreground mt-0.5">Ordens de produção em andamento.</p>
        </div>
        {['admin', 'gestor'].includes(profile.perfil) && (
          <Button onClick={() => navigate('/producao/novo')}>
            <Plus className="h-4 w-4 mr-1" /> Novo Pedido
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar pedido ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_ORDEM_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="urgencia">Mais urgentes</SelectItem>
            <SelectItem value="recente">Mais recentes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Nenhuma ordem encontrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">Prazo</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Etapa Atual</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tempo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(o => {
                  const cfg = STATUS_ORDEM_CONFIG[o.status] || { label: o.status, color: 'bg-muted text-muted-foreground' };
                  const delayed = isDelayed(o.criado_em) && ['EM_ANDAMENTO', 'AGUARDANDO'].includes(o.status);
                  const prazoCfg = STATUS_PRAZO_CONFIG[o.pedidos.status_prazo || 'NO_PRAZO'];
                  const tipoLabel = TIPO_PRODUTO_LABELS[o.tipo_produto || ''] || o.tipo_produto || '—';

                  return (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer hover:bg-accent/40 transition-colors"
                      onClick={() => navigate(`/producao/ordem/${o.id}`)}
                    >
                      <TableCell className="w-8">
                        {prazoCfg && (
                          <span title={prazoCfg.label} className="text-sm">{prazoCfg.icon}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{o.pedidos.numero_pedido}</TableCell>
                      <TableCell className="text-muted-foreground">{o.pedidos.cliente_nome}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">{tipoLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{o.pipeline_producao?.nome}</TableCell>
                      <TableCell className="text-sm">{o.etapa_atual}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{o.operador_atual}</TableCell>
                      <TableCell>
                        <Badge className={`font-normal ${cfg.color}`}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(o.criado_em), { locale: ptBR, addSuffix: true })}
                        </div>
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
