import { Factory, Users, Settings, LayoutDashboard, LogOut, ClipboardList, Store, DollarSign, Truck, RefreshCw, Calendar, Columns3, ShoppingBag, BarChart3, Package, LayoutGrid, PlusCircle, Scissors } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { getAppVersion } from '@/hooks/useVersionCheck';
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
  perfis: PerfilUsuario[];
  group?: string;
}

const navItems: NavItem[] = [
  // Main 3 — gestor/admin/supervisor
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, perfis: ['admin', 'gestor', 'supervisor_producao'] },
  { title: 'Fila Mestre', url: '/producao', icon: ClipboardList, perfis: ['admin', 'gestor', 'supervisor_producao'] },
  { title: 'Setor Corte', url: '/pcp', icon: Scissors, perfis: ['admin', 'gestor', 'supervisor_producao'] },
  { title: 'Kanban Produção', url: '/kanban', icon: Columns3, perfis: ['admin', 'gestor', 'supervisor_producao', 'operador_producao'] },
  { title: 'Kanban Venda', url: '/kanban-venda', icon: LayoutGrid, perfis: ['admin', 'gestor', 'supervisor_producao', 'comercial', 'financeiro', 'logistica'] },

  // Operador — only kanban (above)

  // Comercial
  { title: 'Nova Venda', url: '/comercial/nova-venda', icon: PlusCircle, perfis: ['comercial'] },

  // Loja
  { title: 'Verificar Pedidos', url: '/loja', icon: Store, perfis: ['loja'] },

  // Almoxarifado
  { title: 'Separação Fivelas', url: '/almoxarifado', icon: Package, perfis: ['almoxarifado'] },

  // Admin extras — under Setores group
  { title: 'Loja', url: '/loja', icon: Store, perfis: ['admin', 'gestor'], group: 'setores' },
  { title: 'Nova Venda', url: '/comercial/nova-venda', icon: PlusCircle, perfis: ['admin', 'gestor'], group: 'setores' },
  { title: 'Almoxarifado', url: '/almoxarifado', icon: Package, perfis: ['admin', 'gestor'], group: 'setores' },
  // Config
  { title: 'Relatórios', url: '/relatorios/abc', icon: BarChart3, perfis: ['admin', 'gestor'], group: 'config' },
  { title: 'Usuários', url: '/usuarios', icon: Users, perfis: ['admin'], group: 'config' },
  { title: 'Pipelines', url: '/pipelines', icon: Settings, perfis: ['admin'], group: 'config' },
  { title: 'Integração', url: '/integracao', icon: RefreshCw, perfis: ['admin'], group: 'config' },
];

export function AppSidebar() {
  const { profile, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  if (!profile) return null;

  const visible = navItems.filter(i => {
    // Kanban access is driven by the toggle flags, not just by profile
    if (i.url === '/kanban') return !!profile.kanban_producao_acesso;
    if (i.url === '/kanban-venda') return !!profile.kanban_venda_acesso;
    if (!i.perfis.includes(profile.perfil)) return false;
    return true;
  });
  const mainItems = visible.filter(i => !i.group);
  const setoresItems = visible.filter(i => i.group === 'setores');
  const configItems = visible.filter(i => i.group === 'config');

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Factory className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && <span className="text-sm font-semibold text-sidebar-foreground truncate">BARUC</span>}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item, idx) => (
                <SidebarMenuItem key={`${item.url}-${idx}`}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === '/dashboard'} className="hover:bg-sidebar-accent/60 min-h-[48px]" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {setoresItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Setores</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {setoresItems.map((item, idx) => (
                  <SidebarMenuItem key={`setor-${item.url}-${idx}`}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className="hover:bg-sidebar-accent/60 min-h-[48px]" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {configItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Configurações</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {configItems.map((item, idx) => (
                  <SidebarMenuItem key={`cfg-${item.url}-${idx}`}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className="hover:bg-sidebar-accent/60 min-h-[48px]" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-2 px-1">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{profile.nome}</p>
            <p className="text-xs text-muted-foreground truncate">{profile.perfil}</p>
          </div>
        )}
        <Button variant="ghost" size={collapsed ? 'icon' : 'sm'} onClick={signOut} className="w-full justify-start text-muted-foreground hover:text-destructive min-h-[48px]">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
        {!collapsed && (
          <p className="text-[10px] text-muted-foreground/50 text-center mt-2">v{getAppVersion().slice(-6)}</p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
