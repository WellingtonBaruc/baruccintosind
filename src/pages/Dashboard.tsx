import { useAuth } from '@/hooks/useAuth';
import { Factory, Users, Settings, ClipboardList, PlusCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const isAdmin = profile?.perfil === 'admin';
  const isGestor = profile?.perfil === 'gestor';
  const isProducao = ['operador_producao', 'supervisor_producao', 'admin', 'gestor'].includes(profile?.perfil || '');

  const cards = [
    ...(isProducao ? [{ title: 'Fila de Produção', desc: 'Ver ordens em andamento', icon: ClipboardList, url: '/producao' }] : []),
    ...(isAdmin || isGestor ? [{ title: 'Novo Pedido', desc: 'Criar pedido manualmente', icon: PlusCircle, url: '/producao/novo' }] : []),
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

      {cards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
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

      {cards.length === 0 && (
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
