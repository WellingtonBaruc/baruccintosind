import { Factory, Users, Settings, LayoutDashboard, LogOut, ClipboardList, Store, DollarSign, Truck, RefreshCw, Calendar, ListTodo, Monitor, CalendarDays, ShoppingBag, History, Eye } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth, PerfilUsuario } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  perfis: PerfilUsuario[] | 'all';
}

const navItems: NavItem[] = [
  // Supervisor
  { title: 'Painel', url: '/dashboard', icon: LayoutDashboard, perfis: ['supervisor_producao'] },
  { title: 'Programação do Dia', url: '/programacao', icon: CalendarDays, perfis: ['supervisor_producao'] },
  { title: 'Fila de Produção', url: '/producao', icon: ClipboardList, perfis: ['supervisor_producao'] },
  { title: 'PCP', url: '/pcp', icon: Calendar, perfis: ['supervisor_producao'] },

  // Operador
  { title: 'Minha Fila', url: '/dashboard', icon: ListTodo, perfis: ['operador_producao'] },
  { title: 'Histórico', url: '/producao', icon: History, perfis: ['operador_producao'] },

  // Loja
  { title: 'Verificar Pedidos', url: '/dashboard', icon: Store, perfis: ['loja'] },
  { title: 'Histórico', url: '/loja', icon: History, perfis: ['loja'] },

  // Comercial
  { title: 'Para Validar', url: '/dashboard', icon: ShoppingBag, perfis: ['comercial'] },
  { title: 'Todos os Pedidos', url: '/producao', icon: ClipboardList, perfis: ['comercial'] },
  { title: 'Histórico', url: '/financeiro', icon: History, perfis: ['comercial'] },

  // Financeiro
  { title: 'Para Aprovar', url: '/dashboard', icon: DollarSign, perfis: ['financeiro'] },
  { title: 'Histórico', url: '/financeiro', icon: History, perfis: ['financeiro'] },

  // Admin / Gestor — full menu
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, perfis: ['admin', 'gestor'] },
  { title: 'Painel Supervisor', url: '/painel-supervisor', icon: Eye, perfis: ['admin', 'gestor'] },
  { title: 'Painel Operador', url: '/painel-operador', icon: Eye, perfis: ['admin', 'gestor'] },
  { title: 'Painel Loja', url: '/painel-loja', icon: Eye, perfis: ['admin', 'gestor'] },
  { title: 'Painel Comercial', url: '/painel-comercial', icon: Eye, perfis: ['admin', 'gestor'] },
  { title: 'Painel Financeiro', url: '/painel-financeiro', icon: Eye, perfis: ['admin', 'gestor'] },
  { title: 'Fila de Produção', url: '/producao', icon: ClipboardList, perfis: ['admin', 'gestor'] },
  { title: 'Minha Fila', url: '/minha-fila', icon: ListTodo, perfis: ['admin', 'gestor'] },
  { title: 'Programação do Dia', url: '/programacao', icon: CalendarDays, perfis: ['admin', 'gestor'] },
  { title: 'Painel TV', url: '/painel', icon: Monitor, perfis: ['admin', 'gestor'] },
  { title: 'Fila da Loja', url: '/loja', icon: Store, perfis: ['admin', 'gestor'] },
  { title: 'Financeiro', url: '/financeiro', icon: DollarSign, perfis: ['admin', 'gestor'] },
  { title: 'Logística', url: '/logistica', icon: Truck, perfis: ['admin', 'gestor'] },
  { title: 'PCP', url: '/pcp', icon: Calendar, perfis: ['admin', 'gestor'] },
  { title: 'Usuários', url: '/usuarios', icon: Users, perfis: ['admin'] },
  { title: 'Pipelines', url: '/pipelines', icon: Settings, perfis: ['admin'] },
  { title: 'Integração', url: '/integracao', icon: RefreshCw, perfis: ['admin'] },
];

export function AppSidebar() {
  const { profile, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  if (!profile) return null;

  const visibleItems = navItems.filter(
    (item) => item.perfis === 'all' || item.perfis.includes(profile.perfil)
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Factory className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-sidebar-foreground truncate">BARUC</span>
        )}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item, idx) => (
                <SidebarMenuItem key={`${item.url}-${idx}`}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/dashboard'}
                      className="hover:bg-sidebar-accent/60 min-h-[44px]"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-2 px-1">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{profile.nome}</p>
            <p className="text-xs text-muted-foreground truncate">{profile.perfil}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={signOut}
          className="w-full justify-start text-muted-foreground hover:text-destructive min-h-[48px]"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
