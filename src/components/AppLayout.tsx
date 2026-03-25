import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Loader2, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppLayout() {
  const { profile, loading, connectionError, retryConnection } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (connectionError && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center space-y-4 max-w-sm animate-fade-in">
          <WifiOff className="h-12 w-12 text-muted-foreground/60 mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Problema de conexão com o servidor</h2>
          <p className="text-sm text-muted-foreground">
            Não foi possível conectar ao banco de dados. Verifique sua conexão e tente novamente.
          </p>
          <Button onClick={retryConnection} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (!profile) return <Navigate to="/login" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-4 bg-card shrink-0">
            <SidebarTrigger className="mr-3" />
            <div className="flex-1" />
            <span className="text-sm text-muted-foreground">{profile.nome}</span>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
