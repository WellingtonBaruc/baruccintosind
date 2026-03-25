import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { TIPO_PRODUTO_LABELS, TIPO_PRODUTO_BADGE, STATUS_PRAZO_CONFIG } from '@/lib/pcp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, Play, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FilaItem {
  ordem_id: string;
  etapa_id: string;
  etapa_nome: string;
  pedido_numero: string;
  cliente_nome: string;
  tipo_produto: string | null;
  status_prazo: string | null;
  pedido_id: string;
  quantidade_itens: number;
}

interface ConcluidoItem {
  etapa_nome: string;
  pedido_numero: string;
  concluido_em: string;
}

export default function DashboardOperador() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [atribuidos, setAtribuidos] = useState<FilaItem[]>([]);
  const [concluidos, setConcluidos] = useState<ConcluidoItem[]>([]);
  const [concluirDialog, setConcluirDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FilaItem | null>(null);
  const [quantidadeProduzida, setQuantidadeProduzida] = useState('');
  const [observacao, setObservacao] = useState('');
  const [totalItens, setTotalItens] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (profile) fetchData();
  }, [profile]);

  const fetchData = async () => {
    if (!profile) return;
    setLoading(true);

    const { data: myEtapas } = await supabase
      .from('op_etapas')
      .select('id, ordem_id, nome_etapa, ordens_producao!inner(id, tipo_produto, pedido_id, pedidos!inner(numero_pedido, cliente_nome, status_prazo, status_api))')
      .eq('status', 'EM_ANDAMENTO')
      .eq('operador_id', profile.id)
      .neq('ordens_producao.pedidos.status_api', 'Finalizado');

    const items: FilaItem[] = [];
    for (const e of (myEtapas || [])) {
      const op = e.ordens_producao as any;
      const { data: itens } = await supabase
        .from('pedido_itens')
        .select('quantidade')
        .eq('pedido_id', op.pedido_id);
      const totalQtd = (itens || []).reduce((s: number, i: any) => s + i.quantidade, 0);
      items.push({
        ordem_id: op.id,
        etapa_id: e.id,
        etapa_nome: e.nome_etapa,
        pedido_numero: op.pedidos.numero_pedido,
        cliente_nome: op.pedidos.cliente_nome,
        tipo_produto: op.tipo_produto,
        status_prazo: op.pedidos.status_prazo,
        pedido_id: op.pedido_id,
        quantidade_itens: totalQtd,
      });
    }

    const prazoOrder: Record<string, number> = { ATRASADO: 0, ATENCAO: 1, NO_PRAZO: 2 };
    items.sort((a, b) => (prazoOrder[a.status_prazo || 'NO_PRAZO'] ?? 3) - (prazoOrder[b.status_prazo || 'NO_PRAZO'] ?? 3));
    setAtribuidos(items);

    // Concluídos hoje
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const { data: done } = await supabase
      .from('op_etapas')
      .select('nome_etapa, concluido_em, ordens_producao!inner(pedidos!inner(numero_pedido))')
      .eq('status', 'CONCLUIDA')
      .eq('operador_id', profile.id)
      .gte('concluido_em', today + 'T00:00:00');

    setConcluidos((done || []).map((d: any) => ({
      etapa_nome: d.nome_etapa,
      pedido_numero: d.ordens_producao.pedidos.numero_pedido,
      concluido_em: d.concluido_em,
    })));

    setLoading(false);
  };

  const handleConcluirEtapa = async () => {
    if (!selectedItem || !profile) return;
    setActionLoading(true);
    try {
      // Concluir etapa atual
      await supabase.from('op_etapas').update({
        status: 'CONCLUIDA',
        concluido_em: new Date().toISOString(),
        observacao: observacao || null,
      } as any).eq('id', selectedItem.etapa_id);

      // Avançar próxima
      const { data: allEtapas } = await supabase
        .from('op_etapas')
        .select('id, status, ordem_sequencia')
        .eq('ordem_id', selectedItem.ordem_id)
        .order('ordem_sequencia');
      if (allEtapas) {
        const idx = allEtapas.findIndex(e => e.id === selectedItem.etapa_id);
        if (idx >= 0 && idx + 1 < allEtapas.length) {
          await supabase.from('op_etapas').update({ status: 'EM_ANDAMENTO', iniciado_em: new Date().toISOString() } as any).eq('id', allEtapas[idx + 1].id);
        } else {
          await supabase.from('ordens_producao').update({ status: 'CONCLUIDA' } as any).eq('id', selectedItem.ordem_id);
        }
      }

      await supabase.from('pedido_historico').insert({
        pedido_id: selectedItem.pedido_id,
        usuario_id: profile.id,
        tipo_acao: 'TRANSICAO',
        observacao: `Etapa ${selectedItem.etapa_nome} concluída. Qtd: ${quantidadeProduzida}${observacao ? '. ' + observacao : ''}`,
      });

      toast.success('Etapa concluída!');
      setConcluirDialog(false);
      fetchData();
    } catch {
      toast.error('Erro ao concluir etapa.');
    }
    setActionLoading(false);
  };

  const openConcluir = async (item: FilaItem) => {
    setSelectedItem(item);
    setQuantidadeProduzida('');
    setObservacao('');
    setTotalItens(item.quantidade_itens);
    setConcluirDialog(true);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {profile?.nome}</h1>
        <p className="text-muted-foreground mt-0.5">{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
      </div>

      {/* Atribuídos a mim */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Atribuídos a mim
            <Badge variant="secondary" className="font-normal">{atribuidos.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {atribuidos.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhuma ordem atribuída no momento.</p>}
          {atribuidos.map(item => {
            const prazoCfg = STATUS_PRAZO_CONFIG[item.status_prazo || 'NO_PRAZO'];
            return (
              <div key={item.etapa_id} className="rounded-xl border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.cliente_nome}</p>
                    <p className="text-sm text-muted-foreground">Pedido {item.pedido_numero}</p>
                  </div>
                  <span className="text-lg">{prazoCfg?.icon}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`text-xs font-normal ${TIPO_PRODUTO_BADGE[item.tipo_produto || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                    {TIPO_PRODUTO_LABELS[item.tipo_produto || ''] || 'Outro'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">Etapa: <span className="font-medium text-foreground">{item.etapa_nome}</span></span>
                  <span className="text-sm text-muted-foreground">{item.quantidade_itens} un</span>
                </div>
                <Button className="w-full min-h-[48px]" onClick={() => openConcluir(item)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Concluir etapa
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Concluídos hoje */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Concluídos hoje
            <Badge variant="secondary" className="font-normal">{concluidos.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {concluidos.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma etapa concluída hoje.</p>}
          {concluidos.map((c, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{c.pedido_numero} — {c.etapa_nome}</p>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(c.concluido_em), 'HH:mm')}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Concluir dialog */}
      <Dialog open={concluirDialog} onOpenChange={setConcluirDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Concluir etapa</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Pedido: <span className="font-medium text-foreground">{selectedItem?.pedido_numero}</span> — {selectedItem?.etapa_nome}
            </p>
            <div className="space-y-2">
              <Label>Quantidade produzida (máx: {totalItens})</Label>
              <Input
                type="number"
                value={quantidadeProduzida}
                onChange={e => {
                  const v = Math.min(parseInt(e.target.value) || 0, totalItens);
                  setQuantidadeProduzida(String(v));
                }}
                placeholder="Ex: 100"
                className="min-h-[48px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[48px]" onClick={() => setConcluirDialog(false)}>Cancelar</Button>
            <Button className="min-h-[48px]" onClick={handleConcluirEtapa} disabled={actionLoading}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
