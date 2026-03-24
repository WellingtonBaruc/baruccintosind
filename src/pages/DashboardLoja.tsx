import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { STATUS_PEDIDO_CONFIG, iniciarVerificacaoLoja } from '@/lib/producao';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, Clock, CheckCircle, AlertTriangle, Wrench, Box } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const STATUS_LOJA = ['AGUARDANDO_LOJA', 'LOJA_VERIFICANDO', 'AGUARDANDO_OP_COMPLEMENTAR', 'AGUARDANDO_ALMOXARIFADO'] as const;
const STATUS_POS_LOJA = ['AGUARDANDO_COMERCIAL', 'VALIDADO_COMERCIAL', 'AGUARDANDO_FINANCEIRO', 'VALIDADO_FINANCEIRO', 'LIBERADO_LOGISTICA', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE', 'CANCELADO', 'FINALIZADO_SIMPLIFICA', 'HISTORICO', 'AGUARDANDO_PRODUCAO', 'EM_PRODUCAO', 'PRODUCAO_CONCLUIDA', 'LOJA_OK', 'AGUARDANDO_CIENCIA_COMERCIAL'];

interface PedidoLoja {
  id: string;
  numero_pedido: string;
  api_venda_id: string | null;
  cliente_nome: string;
  status_atual: string;
  criado_em: string;
  valor_liquido: number;
  qtd_itens: number;
  data_venda_api: string | null;
  data_previsao_entrega: string | null;
  observacao_api: string | null;
}

export default function DashboardLoja() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoLoja[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPedidos(); }, []);

  const fetchPedidos = async () => {
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .or(`status_atual.in.(${STATUS_LOJA.join(',')}),and(status_api.eq.Pedido Enviado,status_atual.not.in.(${STATUS_POS_LOJA.join(',')}))`)
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

  const handleIniciarVerificacao = async (pedidoId: string) => {
    try {
      await iniciarVerificacaoLoja(pedidoId, profile!.id);
      toast.success('Verificação iniciada!');
      navigate(`/loja/verificar/${pedidoId}`);
    } catch {
      toast.error('Erro ao iniciar verificação.');
    }
  };

  // Guide header
  const GuideHeader = () => (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <p className="font-medium text-sm mb-2">Como proceder:</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="flex items-start gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
            <span><strong>A.</strong> Tudo em estoque → Confirmar OK</span>
          </div>
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 mt-0.5 shrink-0" />
            <span><strong>B.</strong> Falta item → Gerar OP</span>
          </div>
          <div className="flex items-start gap-1.5">
            <Box className="h-3.5 w-3.5 text-blue-600 mt-0.5 shrink-0" />
            <span><strong>C.</strong> Fivelas → Solicitar almoxarifado</span>
          </div>
          <div className="flex items-start gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-purple-600 mt-0.5 shrink-0" />
            <span><strong>D.</strong> Misto → B + C em paralelo</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verificar Pedidos</h1>
        <p className="text-muted-foreground mt-0.5">{pedidos.length} pedido(s) aguardando verificação</p>
      </div>

      <GuideHeader />

      <div className="space-y-3">
        {pedidos.length === 0 && (
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Package className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nenhum pedido aguardando verificação.</p>
            </CardContent>
          </Card>
        )}
        {pedidos.map(p => {
          const cfg = STATUS_PEDIDO_CONFIG[p.status_atual] || { label: p.status_atual, color: 'bg-muted text-muted-foreground' };
          return (
            <Card key={p.id} className="border-border/60">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.cliente_nome}</p>
                    <p className="text-sm text-muted-foreground">Venda {p.api_venda_id || p.numero_pedido}</p>
                  </div>
                  <Badge className={`font-normal ${cfg.color}`}>{cfg.label}</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {p.qtd_itens} itens</span>
                  <span>{p.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  {p.data_venda_api && (
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Venda: {format(new Date(p.data_venda_api + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                  )}
                  {p.data_previsao_entrega ? (
                    <span className={`flex items-center gap-1 ${p.observacao_api?.includes('[IMPORTADO SEM DATA PREVISTA]') ? 'text-destructive font-medium' : ''}`}>
                      📅 Entrega: {format(new Date(p.data_previsao_entrega + 'T12:00:00'), 'dd/MM/yyyy')}
                    </span>
                  ) : (
                    <span className="text-destructive font-medium">⚠ Sem previsão</span>
                  )}
                </div>
                {p.status_atual === 'AGUARDANDO_LOJA' ? (
                  <Button className="w-full min-h-[48px]" onClick={() => handleIniciarVerificacao(p.id)}>
                    Iniciar verificação
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full min-h-[48px]" onClick={() => navigate(`/loja/verificar/${p.id}`)}>
                    Continuar verificação
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
