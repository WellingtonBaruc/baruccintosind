import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, DollarSign } from 'lucide-react';
import { STATUS_PEDIDO_CONFIG } from '@/lib/producao';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function FilaFinanceira() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const allowed = ['admin', 'gestor', 'financeiro'].includes(profile?.perfil || '');

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const { data } = await supabase
        .from('pedidos')
        .select('*')
        .eq('status_atual', 'AGUARDANDO_FINANCEIRO')
        .order('atualizado_em', { ascending: true });
      setPedidos(data || []);
      setLoading(false);
    })();
  }, [allowed]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fila Financeira</h1>
        <p className="text-muted-foreground mt-1">Pedidos aguardando confirmação de pagamento.</p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : pedidos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <DollarSign className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nenhum pedido aguardando validação financeira.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Forma Pagamento</TableHead>
                  <TableHead>Aguardando há</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.map((p) => {
                  const cfg = STATUS_PEDIDO_CONFIG[p.status_atual] || { label: p.status_atual, color: '' };
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/financeiro/validar/${p.id}`)}>
                      <TableCell className="font-medium">{p.numero_pedido}</TableCell>
                      <TableCell>{p.cliente_nome}</TableCell>
                      <TableCell>R$ {Number(p.valor_liquido).toFixed(2)}</TableCell>
                      <TableCell>{p.forma_pagamento || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(p.atualizado_em), { locale: ptBR, addSuffix: true })}
                      </TableCell>
                      <TableCell><Badge className={cfg.color}>{cfg.label}</Badge></TableCell>
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
