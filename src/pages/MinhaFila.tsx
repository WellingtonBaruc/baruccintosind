import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_PRAZO_CONFIG, TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE } from '@/lib/pcp';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Play, CheckCircle2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface FilaItem {
  ordem_id: string;
  etapa_id: string;
  etapa_nome: string;
  pedido_numero: string;
  cliente_nome: string;
  tipo_produto: string | null;
  status_prazo: string | null;
  pedido_id: string;
}

export default function MinhaFila() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [atribuidos, setAtribuidos] = useState<FilaItem[]>([]);
  const [disponiveis, setDisponiveis] = useState<FilaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Execution dialogs
  const [iniciarDialog, setIniciarDialog] = useState(false);
  const [concluirDialog, setConcluirDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FilaItem | null>(null);
  const [quantidadePrevista, setQuantidadePrevista] = useState('');
  const [quantidadeProduzida, setQuantidadeProduzida] = useState('');
  const [observacao, setObservacao] = useState('');
  const [totalItensVenda, setTotalItensVenda] = useState(0);

  useEffect(() => {
    if (profile) fetchData();
  }, [profile]);

  const fetchData = async () => {
    if (!profile) return;
    setLoading(true);

    // Fetch active stages assigned to me
    const { data: myEtapas } = await supabase
      .from('op_etapas')
      .select('id, ordem_id, nome_etapa, ordens_producao!inner(id, tipo_produto, pedido_id, pedidos!inner(numero_pedido, cliente_nome, status_prazo, status_api))')
      .eq('status', 'EM_ANDAMENTO')
      .eq('operador_id', profile.id)
      .neq('ordens_producao.pedidos.status_api', 'Finalizado');

    // Fetch active stages without operator
    const { data: freeEtapas } = await supabase
      .from('op_etapas')
      .select('id, ordem_id, nome_etapa, ordens_producao!inner(id, tipo_produto, pedido_id, pedidos!inner(numero_pedido, cliente_nome, status_prazo, status_api))')
      .eq('status', 'EM_ANDAMENTO')
      .is('operador_id', null)
      .neq('ordens_producao.pedidos.status_api', 'Finalizado');

    const mapToFilaItem = (e: any): FilaItem => ({
      ordem_id: e.ordens_producao.id,
      etapa_id: e.id,
      etapa_nome: e.nome_etapa,
      pedido_numero: e.ordens_producao.pedidos.numero_pedido,
      cliente_nome: e.ordens_producao.pedidos.cliente_nome,
      tipo_produto: e.ordens_producao.tipo_produto,
      status_prazo: e.ordens_producao.pedidos.status_prazo,
      pedido_id: e.ordens_producao.pedido_id,
    });

    const prazoOrder: Record<string, number> = { ATRASADO: 0, ATENCAO: 1, NO_PRAZO: 2 };
    const sortByPrazo = (a: FilaItem, b: FilaItem) => {
      const pa = prazoOrder[a.status_prazo || 'NO_PRAZO'] ?? 3;
      const pb = prazoOrder[b.status_prazo || 'NO_PRAZO'] ?? 3;
      return pa - pb;
    };

    setAtribuidos((myEtapas || []).map(mapToFilaItem).sort(sortByPrazo));
    setDisponiveis((freeEtapas || []).map(mapToFilaItem).sort(sortByPrazo));
    setLoading(false);
  };

  if (!profile || profile.perfil !== 'operador_producao') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleAssumir = async (item: FilaItem) => {
    setActionLoading(true);
    try {
      await supabase.from('op_etapas').update({
        operador_id: profile.id,
        iniciado_em: new Date().toISOString(),
      }).eq('id', item.etapa_id);

      await supabase.from('pedido_historico').insert({
        pedido_id: item.pedido_id,
        usuario_id: profile.id,
        tipo_acao: 'TRANSICAO',
        observacao: `Operador ${profile.nome} assumiu a etapa ${item.etapa_nome}.`,
      });

      toast.success(`Você assumiu o pedido ${item.pedido_numero}`);
      fetchData();
    } catch {
      toast.error('Erro ao assumir.');
    }
    setActionLoading(false);
  };

  const handleExecutar = (item: FilaItem) => {
    setSelectedItem(item);
    setQuantidadePrevista('');
    setIniciarDialog(true);
  };

  const handleIniciarExecucao = () => {
    setIniciarDialog(false);
    if (selectedItem) {
      navigate(`/producao/ordem/${selectedItem.ordem_id}`);
    }
  };

  const handleAbrirConcluir = async (item: FilaItem) => {
    setSelectedItem(item);
    // Fetch total items
    const { data: itens } = await supabase
      .from('pedido_itens')
      .select('quantidade')
      .eq('pedido_id', item.pedido_id);
    const total = (itens || []).reduce((s, i) => s + i.quantidade, 0);
    setTotalItensVenda(total);
    setQuantidadeProduzida('');
    setObservacao('');
    setConcluirDialog(true);
  };

  const renderTable = (items: FilaItem[], tipo: 'atribuidos' | 'disponiveis') => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">Prazo</TableHead>
          <TableHead>Pedido</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Etapa</TableHead>
          <TableHead className="text-right">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
              {tipo === 'atribuidos' ? 'Nenhuma ordem atribuída a você.' : 'Nenhuma ordem disponível.'}
            </TableCell>
          </TableRow>
        ) : items.map(item => {
          const prazoCfg = STATUS_PRAZO_CONFIG[item.status_prazo || 'NO_PRAZO'];
          return (
            <TableRow key={item.etapa_id}>
              <TableCell>{prazoCfg && <span title={prazoCfg.label}>{prazoCfg.icon}</span>}</TableCell>
              <TableCell className="font-medium">{item.pedido_numero}</TableCell>
              <TableCell className="text-muted-foreground">{item.cliente_nome}</TableCell>
              <TableCell>
                <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[item.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                  {TIPO_PRODUTO_LABELS[item.tipo_produto || ''] || 'A classificar'}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{item.etapa_nome}</TableCell>
              <TableCell className="text-right">
                {tipo === 'atribuidos' ? (
                  <Button size="sm" onClick={() => handleExecutar(item)} disabled={actionLoading}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Executar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleAssumir(item)} disabled={actionLoading}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Assumir
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha Fila</h1>
        <p className="text-muted-foreground mt-0.5">Ordens atribuídas a você e disponíveis para assumir.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Atribuídos a mim
                <Badge variant="secondary" className="font-normal">{atribuidos.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {renderTable(atribuidos, 'atribuidos')}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Disponíveis para pegar
                <Badge variant="secondary" className="font-normal">{disponiveis.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {renderTable(disponiveis, 'disponiveis')}
            </CardContent>
          </Card>
        </>
      )}

      {/* Iniciar dialog */}
      <Dialog open={iniciarDialog} onOpenChange={setIniciarDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Iniciar execução</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Pedido: <span className="font-medium text-foreground">{selectedItem?.pedido_numero}</span> — Etapa: <span className="font-medium text-foreground">{selectedItem?.etapa_nome}</span>
            </p>
            <div className="space-y-2">
              <Label>Quantidade prevista</Label>
              <Input type="number" value={quantidadePrevista} onChange={e => setQuantidadePrevista(e.target.value)} placeholder="Ex: 100" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIniciarDialog(false)}>Cancelar</Button>
            <Button onClick={handleIniciarExecucao}>
              <Play className="h-4 w-4 mr-1" /> Ir para a ordem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Concluir dialog */}
      <Dialog open={concluirDialog} onOpenChange={setConcluirDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Concluir etapa</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Quantidade produzida (máx: {totalItensVenda})</Label>
              <Input
                type="number"
                value={quantidadeProduzida}
                onChange={e => {
                  const v = Math.min(parseInt(e.target.value) || 0, totalItensVenda);
                  setQuantidadeProduzida(String(v));
                }}
                placeholder="Ex: 95"
              />
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConcluirDialog(false)}>Cancelar</Button>
            <Button onClick={() => { setConcluirDialog(false); toast.success('Etapa concluída!'); fetchData(); }}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
