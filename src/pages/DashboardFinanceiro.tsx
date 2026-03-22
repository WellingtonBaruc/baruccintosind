import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, XCircle, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface PedidoFinanceiro {
  id: string;
  numero_pedido: string;
  cliente_nome: string;
  valor_liquido: number;
  forma_pagamento: string | null;
}

export default function DashboardFinanceiro() {
  const { profile } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [bloquearDialog, setBloquearDialog] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<PedidoFinanceiro | null>(null);
  const [motivo, setMotivo] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { fetchPedidos(); }, []);

  const fetchPedidos = async () => {
    const { data } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, cliente_nome, valor_liquido, forma_pagamento')
      .eq('status_atual', 'AGUARDANDO_FINANCEIRO')
      .order('atualizado_em', { ascending: true });
    setPedidos(data || []);
    setLoading(false);
  };

  const handleAprovar = async (p: PedidoFinanceiro) => {
    setActionLoading(true);
    try {
      await supabase.from('pedidos').update({
        status_atual: 'LIBERADO_LOGISTICA',
        pagamento_confirmado: true,
        data_pagamento_confirmado: new Date().toISOString().split('T')[0],
      } as any).eq('id', p.id);

      await supabase.from('pedido_financeiro').insert({
        pedido_id: p.id,
        confirmado_por: profile!.id,
        pagamento_confirmado: true,
        data_confirmacao: new Date().toISOString(),
        forma_pagamento_confirmada: p.forma_pagamento,
      });

      await supabase.from('pedido_historico').insert({
        pedido_id: p.id,
        usuario_id: profile!.id,
        tipo_acao: 'APROVACAO',
        status_anterior: 'AGUARDANDO_FINANCEIRO',
        status_novo: 'LIBERADO_LOGISTICA',
        observacao: 'Pagamento aprovado pelo financeiro.',
      });

      toast.success('Pagamento aprovado!');
      fetchPedidos();
    } catch {
      toast.error('Erro ao aprovar.');
    }
    setActionLoading(false);
  };

  const handleBloquear = async () => {
    if (!selectedPedido || !profile) return;
    setActionLoading(true);
    try {
      await supabase.from('pedidos').update({ status_atual: 'BLOQUEADO' } as any).eq('id', selectedPedido.id);

      await supabase.from('pedido_financeiro').insert({
        pedido_id: selectedPedido.id,
        confirmado_por: profile.id,
        pagamento_confirmado: false,
        motivo_bloqueio: motivo,
      });

      await supabase.from('pedido_historico').insert({
        pedido_id: selectedPedido.id,
        usuario_id: profile.id,
        tipo_acao: 'REJEICAO',
        status_anterior: 'AGUARDANDO_FINANCEIRO',
        status_novo: 'BLOQUEADO',
        observacao: `Pagamento bloqueado: ${motivo}`,
      });

      toast.success('Pedido bloqueado.');
      setBloquearDialog(false);
      fetchPedidos();
    } catch {
      toast.error('Erro ao bloquear.');
    }
    setActionLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Para Aprovar</h1>
        <p className="text-muted-foreground mt-0.5">{pedidos.length} pedido(s) aguardando aprovação financeira</p>
      </div>

      <div className="space-y-3">
        {pedidos.length === 0 && (
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <DollarSign className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nenhum pedido aguardando aprovação.</p>
            </CardContent>
          </Card>
        )}
        {pedidos.map(p => (
          <Card key={p.id} className="border-border/60">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{p.cliente_nome}</p>
                  <p className="text-sm text-muted-foreground">Pedido {p.numero_pedido}</p>
                </div>
                <span className="text-sm font-semibold">
                  {p.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Forma de pagamento: <span className="font-medium text-foreground">{p.forma_pagamento || '—'}</span>
              </p>
              <div className="flex gap-2">
                <Button className="flex-1 min-h-[48px]" onClick={() => handleAprovar(p)} disabled={actionLoading}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Aprovar
                </Button>
                <Button variant="destructive" className="flex-1 min-h-[48px]" onClick={() => { setSelectedPedido(p); setMotivo(''); setBloquearDialog(true); }} disabled={actionLoading}>
                  <XCircle className="h-4 w-4 mr-2" /> Bloquear
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={bloquearDialog} onOpenChange={setBloquearDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Bloquear Pedido</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Pedido: <span className="font-medium text-foreground">{selectedPedido?.numero_pedido}</span>
            </p>
            <div className="space-y-2">
              <Label>Motivo do bloqueio</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Descreva o motivo..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[48px]" onClick={() => setBloquearDialog(false)}>Cancelar</Button>
            <Button variant="destructive" className="min-h-[48px]" onClick={handleBloquear} disabled={actionLoading || !motivo}>
              Confirmar Bloqueio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
