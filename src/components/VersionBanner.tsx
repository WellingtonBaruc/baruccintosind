import { useVersionCheck } from '@/hooks/useVersionCheck';
import { useAuth } from '@/hooks/useAuth';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRef } from 'react';

const RELOAD_COOLDOWN_MS = 15_000;

export function VersionBanner() {
  const { hasUpdate, reload } = useVersionCheck();
  const { loading } = useAuth();
  const lastReloadRef = useRef(0);

  // Don't show banner while auth is loading to avoid reload loops
  if (!hasUpdate || loading) return null;

  const handleReload = () => {
    const now = Date.now();
    if (now - lastReloadRef.current < RELOAD_COOLDOWN_MS) return;
    lastReloadRef.current = now;
    reload();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-card px-4 py-3 shadow-lg">
        <RefreshCw className="h-4 w-4 text-primary animate-spin" />
        <span className="text-sm font-medium">Nova versão disponível</span>
        <Button size="lg" onClick={handleReload} className="ml-1 text-2xl px-12 py-6 font-bold">
          Atualizar
        </Button>
      </div>
    </div>
  );
}
