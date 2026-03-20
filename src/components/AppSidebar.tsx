import { Factory, Users, Settings, LayoutDashboard, LogOut, ClipboardList, PlusCircle, Store, DollarSign, Truck, RefreshCw } from 'lucide-react';
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
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, perfis: 'all' },
  { title: 'Fila de Produção', url: '/producao', icon: ClipboardList, perfis: ['admin', 'gestor', 'supervisor_producao', 'operador_producao'] },
  { title: 'Novo Pedido', url: '/producao/novo', icon: PlusCircle, perfis: ['admin', 'gestor'] },
  { title: 'Fila da Loja', url: '/loja', icon: Store, perfis: ['admin', 'gestor', 'loja'] },
  { title: 'Financeiro', url: '/financeiro', icon: DollarSign, perfis: ['admin', 'gestor', 'financeiro'] },
  { title: 'Logística', url: '/logistica', icon: Truck, perfis: ['admin', 'gestor', 'logistica'] },
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
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/dashboard'}
                      className="hover:bg-sidebar-accent/60"
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
          className="w-full justify-start text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
