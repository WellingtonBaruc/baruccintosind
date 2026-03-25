import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, ArrowLeft, CheckCircle2, Ban } from 'lucide-react';
import { STATUS_PEDIDO_CONFIG } from '@/lib/producao';
import { toast } from 'sonner';

export default function ValidacaoFinanceira() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const allowed = ['admin', 'gestor', 'financeiro'].includes(profile?.perfil || '');

  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [dataConfirmacao, setDataConfirmacao] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }));
  const [observacao, setObservacao] = useState('');
  const [bloqueioOpen, setBloqueioOpen] = useState(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');

  useEffect(() => {
    if (!id || !allowed) return;
    (async () => {
      const { data } = await supabase.from('pedidos').select('*').eq('id', id).single();
      setPedido(data);
      setLoading(false);
    })();
  }, [id, allowed]);

  if (!allowed) return <Navigate to="/dashboard" replace />;
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!pedido) return <p className="text-center py-12 text-muted-foreground">Pedido não encontrado.</p>;

  const cfg = STATUS_PEDIDO_CONFIG[pedido.status_atual] || { label: pedido.status_atual, color: '' };

  const handleAprovar = async () => {
    if (!confirmado) { toast.error('Marque a confirmação de pagamento.'); return; }
    setSaving(true);
    try {
      await supabase.from('pedido_financeiro').upsert({
        pedido_id: pedido.id,
        confirmado_por: profile!.id,
        pagamento_confirmado: true,
        data_confirmacao: new Date(dataConfirmacao).toISOString(),
        forma_pagamento_confirmada: pedido.forma_pagamento,
        observacao: observacao || null,
      }, { onConflict: 'pedido_id' });

      await supabase.from('pedidos').update({
        status_atual: 'LIBERADO_LOGISTICA',
        pagamento_confirmado: true,
        data_pagamento_confirmado: dataConfirmacao,
        observacao_financeiro: observacao || null,
      }).eq('id', pedido.id);

      await supabase.from('pedido_historico').insert({
        pedido_id: pedido.id,
        usuario_id: profile!.id,
        tipo_acao: 'APROVACAO',
        status_anterior: pedido.status_atual,
        status_novo: 'LIBERADO_LOGISTICA',
        observacao: 'Pagamento confirmado. Liberado para logística.',
      });

      toast.success('Pedido liberado para logística.');
      navigate('/financeiro');
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  const handleBloquear = async () => {
    if (!motivoBloqueio.trim()) { toast.error('Informe o motivo do bloqueio.'); return; }
    setSaving(true);
    try {
      await supabase.from('pedido_financeiro').upsert({
        pedido_id: pedido.id,
        confirmado_por: profile!.id,
        pagamento_confirmado: false,
        motivo_bloqueio: motivoBloqueio,
      }, { onConflict: 'pedido_id' });

      await supabase.from('pedidos').update({
        status_atual: 'BLOQUEADO',
        observacao_financeiro: `BLOQUEADO: ${motivoBloqueio}`,
      }).eq('id', pedido.id);

      await supabase.from('pedido_historico').insert({
        pedido_id: pedido.id,
        usuario_id: profile!.id,
        tipo_acao: 'REJEICAO',
        status_anterior: pedido.status_atual,
        status_novo: 'BLOQUEADO',
        observacao: `Pedido bloqueado: ${motivoBloqueio}`,
      });

      toast.success('Pedido bloqueado.');
      navigate('/financeiro');
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
    setBloqueioOpen(false);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/financeiro')} className="text-muted-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Button>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Validação Financeira — {pedido.numero_pedido}</h1>
        <Badge className={cfg.color}>{cfg.label}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Dados do Pedido</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Cliente:</span> {pedido.cliente_nome}</p>
            <p><span className="text-muted-foreground">CPF/CNPJ:</span> {pedido.cliente_cpf_cnpj || '—'}</p>
            <p><span className="text-muted-foreground">Telefone:</span> {pedido.cliente_telefone || '—'}</p>
            <p><span className="text-muted-foreground">Endereço:</span> {pedido.cliente_endereco || '—'}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Informações Financeiras</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Valor Bruto:</span> R$ {Number(pedido.valor_bruto).toFixed(2)}</p>
            <p><span className="text-muted-foreground">Desconto:</span> R$ {Number(pedido.valor_desconto).toFixed(2)}</p>
            <p className="text-base font-semibold"><span className="text-muted-foreground font-normal">Valor Líquido:</span> R$ {Number(pedido.valor_liquido).toFixed(2)}</p>
            <p><span className="text-muted-foreground">Forma de Pagamento:</span> {pedido.forma_pagamento || '—'}</p>
            <p><span className="text-muted-foreground">Obs. Comercial:</span> {pedido.observacao_comercial || '—'}</p>
          </CardContent>
        </Card>
      </div>

      {pedido.status_atual === 'AGUARDANDO_FINANCEIRO' && (
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Confirmação de Pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox id="confirma" checked={confirmado} onCheckedChange={(v) => setConfirmado(!!v)} />
              <Label htmlFor="confirma" className="cursor-pointer">Confirmo que o pagamento foi recebido</Label>
            </div>
            <div className="space-y-2 max-w-xs">
              <Label>Data de confirmação</Label>
              <Input type="date" value={dataConfirmacao} onChange={(e) => setDataConfirmacao(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Observação financeira (opcional)</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observações sobre o pagamento..." rows={3} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleAprovar} disabled={saving || !confirmado}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Aprovar e liberar para logística
              </Button>
              <Button variant="destructive" onClick={() => setBloqueioOpen(true)} disabled={saving}>
                <Ban className="h-4 w-4 mr-1" /> Bloquear pedido
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={bloqueioOpen} onOpenChange={setBloqueioOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Bloquear Pedido</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Motivo do bloqueio *</Label>
            <Textarea value={motivoBloqueio} onChange={(e) => setMotivoBloqueio(e.target.value)} placeholder="Descreva o motivo..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBloqueioOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleBloquear} disabled={saving || !motivoBloqueio.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar bloqueio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
