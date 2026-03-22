import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, Package } from 'lucide-react';
import { toast } from 'sonner';

interface PedidoComercial {
  id: string;
  numero_pedido: string;
  cliente_nome: string;
  valor_liquido: number;
  tipo_fluxo: string | null;
  data_previsao_entrega: string | null;
  observacao_comercial: string | null;
}

const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de Crédito', 'Depósito Bancário', 'Cheque', 'Outros'];
const FORMAS_ENVIO = ['Correios', 'Transportadora', 'Retirada na loja', 'Motoboy', 'Outros'];

export default function DashboardComercial() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoComercial[]>([]);
  const [loading, setLoading] = useState(true);
  const [validarDialog, setValidarDialog] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<PedidoComercial | null>(null);
  const [formaPagamento, setFormaPagamento] = useState('');
  const [formaEnvio, setFormaEnvio] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { fetchPedidos(); }, []);

  const fetchPedidos = async () => {
    const { data } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, cliente_nome, valor_liquido, tipo_fluxo, data_previsao_entrega, observacao_comercial')
      .eq('status_atual', 'AGUARDANDO_COMERCIAL')
      .order('atualizado_em', { ascending: true });
    setPedidos(data || []);
    setLoading(false);
  };

  const handleValidar = async () => {
    if (!selectedPedido || !profile || !formaPagamento || !formaEnvio) {
      toast.error('Preencha forma de pagamento e envio.');
      return;
    }
    setActionLoading(true);
    try {
      await supabase.from('pedidos').update({
        status_atual: 'AGUARDANDO_FINANCEIRO',
        forma_pagamento: formaPagamento,
        forma_envio: formaEnvio,
      } as any).eq('id', selectedPedido.id);

      await supabase.from('pedido_historico').insert({
        pedido_id: selectedPedido.id,
        usuario_id: profile.id,
        tipo_acao: 'TRANSICAO',
        status_anterior: 'AGUARDANDO_COMERCIAL',
        status_novo: 'AGUARDANDO_FINANCEIRO',
        observacao: `Validado pelo comercial. Pgto: ${formaPagamento}, Envio: ${formaEnvio}`,
      });

      toast.success('Pedido validado e encaminhado ao financeiro!');
      setValidarDialog(false);
      fetchPedidos();
    } catch {
      toast.error('Erro ao validar.');
    }
    setActionLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Para Validar</h1>
        <p className="text-muted-foreground mt-0.5">{pedidos.length} pedido(s) aguardando validação comercial</p>
      </div>

      <div className="space-y-3">
        {pedidos.length === 0 && (
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Package className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nenhum pedido para validar.</p>
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
              {p.data_previsao_entrega && (
                <p className="text-xs text-muted-foreground">Previsão de entrega: {p.data_previsao_entrega}</p>
              )}
              {p.observacao_comercial && (
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">Obs: {p.observacao_comercial}</p>
              )}
              <Button className="w-full min-h-[48px]" onClick={() => {
                setSelectedPedido(p);
                setFormaPagamento(p.tipo_fluxo || '');
                setFormaEnvio('');
                setValidarDialog(true);
              }}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Validar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={validarDialog} onOpenChange={setValidarDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Validar Pedido</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Pedido: <span className="font-medium text-foreground">{selectedPedido?.numero_pedido}</span> — {selectedPedido?.cliente_nome}
            </p>
            <div className="space-y-2">
              <Label>Forma de pagamento *</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger className="min-h-[48px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Forma de envio *</Label>
              <Select value={formaEnvio} onValueChange={setFormaEnvio}>
                <SelectTrigger className="min-h-[48px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {FORMAS_ENVIO.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[48px]" onClick={() => setValidarDialog(false)}>Cancelar</Button>
            <Button className="min-h-[48px]" onClick={handleValidar} disabled={actionLoading || !formaPagamento || !formaEnvio}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
