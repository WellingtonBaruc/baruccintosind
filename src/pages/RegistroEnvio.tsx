import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft, PackageCheck, Truck, CheckCircle2 } from 'lucide-react';
import { STATUS_PEDIDO_CONFIG } from '@/lib/producao';
import { toast } from 'sonner';

export default function RegistroEnvio() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const allowed = ['admin', 'gestor', 'logistica'].includes(profile?.perfil || '');

  const [pedido, setPedido] = useState<any>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [logistica, setLogistica] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dataEnvio, setDataEnvio] = useState(new Date().toISOString().slice(0, 10));
  const [transportadora, setTransportadora] = useState('');
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (!id || !allowed) return;
    (async () => {
      const [pedidoRes, itensRes, logRes] = await Promise.all([
        supabase.from('pedidos').select('*').eq('id', id).single(),
        supabase.from('pedido_itens').select('*').eq('pedido_id', id),
        supabase.from('pedido_logistica').select('*').eq('pedido_id', id).maybeSingle(),
      ]);
      setPedido(pedidoRes.data);
      setItens(itensRes.data || []);
      setLogistica(logRes.data);
      if (logRes.data) {
        setTransportadora(logRes.data.transportadora || '');
        setCodigoRastreio(logRes.data.codigo_rastreio || '');
      }
      setLoading(false);
    })();
  }, [id, allowed]);

  if (!allowed) return <Navigate to="/dashboard" replace />;
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!pedido) return <p className="text-center py-12 text-muted-foreground">Pedido não encontrado.</p>;

  const cfg = STATUS_PEDIDO_CONFIG[pedido.status_atual] || { label: pedido.status_atual, color: '' };

  const handleIniciarSeparacao = async () => {
    setSaving(true);
    try {
      await supabase.from('pedidos').update({ status_atual: 'EM_SEPARACAO' }).eq('id', pedido.id);
      await supabase.from('pedido_historico').insert({
        pedido_id: pedido.id, usuario_id: profile!.id, tipo_acao: 'TRANSICAO',
        status_anterior: 'LIBERADO_LOGISTICA', status_novo: 'EM_SEPARACAO',
        observacao: 'Separação iniciada.',
      });
      setPedido({ ...pedido, status_atual: 'EM_SEPARACAO' });
      toast.success('Separação iniciada.');
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const handleConfirmarEnvio = async () => {
    if (!dataEnvio) { toast.error('Informe a data de envio.'); return; }
    setSaving(true);
    try {
      const rastreio = codigoRastreio.trim() || 'Sem rastreio';
      await supabase.from('pedido_logistica').upsert({
        pedido_id: pedido.id,
        responsavel_envio_id: profile!.id,
        data_envio: new Date(dataEnvio).toISOString(),
        codigo_rastreio: rastreio,
        transportadora: transportadora || null,
        observacao: observacao || null,
      }, { onConflict: 'pedido_id' });

      await supabase.from('pedidos').update({
        status_atual: 'ENVIADO',
        codigo_rastreio: rastreio,
        data_envio: dataEnvio,
        observacao_logistica: observacao || null,
      }).eq('id', pedido.id);

      await supabase.from('pedido_historico').insert({
        pedido_id: pedido.id, usuario_id: profile!.id, tipo_acao: 'TRANSICAO',
        status_anterior: pedido.status_atual, status_novo: 'ENVIADO',
        observacao: `Envio confirmado. Transportadora: ${transportadora || '—'}. Rastreio: ${rastreio}.`,
      });

      toast.success('Envio confirmado.');
      navigate('/logistica');
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const handleConfirmarEntrega = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await supabase.from('pedido_logistica').update({
        data_entrega_confirmada: now,
      }).eq('pedido_id', pedido.id);

      await supabase.from('pedidos').update({
        status_atual: 'ENTREGUE',
        data_entrega: new Date().toISOString().slice(0, 10),
      }).eq('id', pedido.id);

      await supabase.from('pedido_historico').insert({
        pedido_id: pedido.id, usuario_id: profile!.id, tipo_acao: 'TRANSICAO',
        status_anterior: 'ENVIADO', status_novo: 'ENTREGUE',
        observacao: 'Entrega confirmada.',
      });

      toast.success('Entrega confirmada. Pedido encerrado.');
      navigate('/logistica');
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/logistica')} className="text-muted-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Button>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Logística — {pedido.numero_pedido}</h1>
        <Badge className={cfg.color}>{cfg.label}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Dados do Pedido</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Cliente:</span> {pedido.cliente_nome}</p>
            <p><span className="text-muted-foreground">Endereço:</span> {pedido.cliente_endereco || '—'}</p>
            <p><span className="text-muted-foreground">Telefone:</span> {pedido.cliente_telefone || '—'}</p>
            <p><span className="text-muted-foreground">Forma de envio:</span> {pedido.forma_envio || '—'}</p>
            <p><span className="text-muted-foreground">Valor:</span> R$ {Number(pedido.valor_liquido).toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Itens do Pedido</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Obs. Produção</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.descricao_produto}</TableCell>
                    <TableCell>{item.quantidade}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{item.observacao_producao || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {pedido.status_atual === 'LIBERADO_LOGISTICA' && (
        <Card className="border-border/60">
          <CardContent className="p-5">
            <Button onClick={handleIniciarSeparacao} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-1" />}
              Iniciar separação
            </Button>
          </CardContent>
        </Card>
      )}

      {pedido.status_atual === 'EM_SEPARACAO' && (
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Registrar Envio</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Data de envio *</Label>
                <Input type="date" value={dataEnvio} onChange={(e) => setDataEnvio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Transportadora</Label>
                <Input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} placeholder="Nome da transportadora" />
              </div>
            </div>
            <div className="space-y-2 max-w-sm">
              <Label>Código de rastreio (opcional)</Label>
              <Input value={codigoRastreio} onChange={(e) => setCodigoRastreio(e.target.value)} placeholder="Se vazio, será 'Sem rastreio'" />
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleConfirmarEnvio} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4 mr-1" />}
              Confirmar envio
            </Button>
          </CardContent>
        </Card>
      )}

      {pedido.status_atual === 'ENVIADO' && (
        <Card className="border-border/60">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Rastreio: <span className="font-medium text-foreground">{pedido.codigo_rastreio || '—'}</span>
            </div>
            <Button onClick={handleConfirmarEntrega} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Confirmar entrega
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
