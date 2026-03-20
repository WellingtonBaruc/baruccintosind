import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Factory, Users, Settings, ClipboardList, PlusCircle, DollarSign, Truck, Store, Package, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

interface Counts {
  emProducao: number;
  aguardandoLoja: number;
  aguardandoFinanceiro: number;
  liberadoLogistica: number;
  enviadosHoje: number;
  encerradosMes: number;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts | null>(null);

  const isAdmin = profile?.perfil === 'admin';
  const isGestor = profile?.perfil === 'gestor';
  const isProducao = ['operador_producao', 'supervisor_producao', 'admin', 'gestor'].includes(profile?.perfil || '');
  const isFinanceiro = ['financeiro', 'admin', 'gestor'].includes(profile?.perfil || '');
  const isLogistica = ['logistica', 'admin', 'gestor'].includes(profile?.perfil || '');
  const isLoja = ['loja', 'admin', 'gestor'].includes(profile?.perfil || '');

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const monthStart = today.slice(0, 8) + '01';
      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_atual', 'EM_PRODUCAO'),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).in('status_atual', ['AGUARDANDO_LOJA', 'LOJA_VERIFICANDO']),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_atual', 'AGUARDANDO_FINANCEIRO'),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).in('status_atual', ['LIBERADO_LOGISTICA', 'EM_SEPARACAO']),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_atual', 'ENVIADO').gte('data_envio', today),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('status_atual', 'ENTREGUE').gte('atualizado_em', monthStart),
      ]);
      setCounts({
        emProducao: r1.count || 0,
        aguardandoLoja: r2.count || 0,
        aguardandoFinanceiro: r3.count || 0,
        liberadoLogistica: r4.count || 0,
        enviadosHoje: r5.count || 0,
        encerradosMes: r6.count || 0,
      });
    })();
  }, []);

  const statsCards = counts ? [
    { title: 'Em Produção', value: counts.emProducao, icon: ClipboardList, color: 'text-primary' },
    { title: 'Aguardando Loja', value: counts.aguardandoLoja, icon: Store, color: 'text-amber-600' },
    { title: 'Aguardando Financeiro', value: counts.aguardandoFinanceiro, icon: DollarSign, color: 'text-amber-600' },
    { title: 'Liberados Logística', value: counts.liberadoLogistica, icon: Truck, color: 'text-primary' },
    { title: 'Enviados Hoje', value: counts.enviadosHoje, icon: Package, color: 'text-emerald-600' },
    { title: 'Encerrados no Mês', value: counts.encerradosMes, icon: CheckCircle2, color: 'text-emerald-600' },
  ] : [];

  const navCards = [
    ...(isProducao ? [{ title: 'Fila de Produção', desc: 'Ver ordens em andamento', icon: ClipboardList, url: '/producao' }] : []),
    ...(isAdmin || isGestor ? [{ title: 'Novo Pedido', desc: 'Criar pedido manualmente', icon: PlusCircle, url: '/producao/novo' }] : []),
    ...(isLoja ? [{ title: 'Fila da Loja', desc: 'Verificar pedidos pronta entrega', icon: Store, url: '/loja' }] : []),
    ...(isFinanceiro ? [{ title: 'Fila Financeira', desc: 'Confirmar pagamentos', icon: DollarSign, url: '/financeiro' }] : []),
    ...(isLogistica ? [{ title: 'Logística', desc: 'Separar e enviar pedidos', icon: Truck, url: '/logistica' }] : []),
    ...(isAdmin ? [
      { title: 'Gestão de Usuários', desc: 'Criar e gerenciar contas', icon: Users, url: '/usuarios' },
      { title: 'Pipelines', desc: 'Configurar fluxos de produção', icon: Settings, url: '/pipelines' },
    ] : []),
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {profile?.nome}</h1>
        <p className="text-muted-foreground mt-1">Bem-vindo ao sistema de gestão de produção.</p>
      </div>

      {counts && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {statsCards.map((s) => (
            <Card key={s.title} className="border-border/60">
              <CardContent className="p-4 flex flex-col items-center text-center gap-1">
                <s.icon className={`h-5 w-5 ${s.color}`} />
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {navCards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {navCards.map((c) => (
            <Card
              key={c.url}
              className="cursor-pointer border-border/60 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 active:scale-[0.98]"
              onClick={() => navigate(c.url)}
            >
              <CardContent className="flex items-start gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <c.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-card-foreground">{c.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{c.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {navCards.length === 0 && (
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Factory className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Seus módulos estarão disponíveis em breve.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
