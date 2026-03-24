import { useVersionCheck } from '@/hooks/useVersionCheck';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function VersionBanner() {
  const { hasUpdate, reload } = useVersionCheck();

  if (!hasUpdate) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-card px-4 py-3 shadow-lg">
        <RefreshCw className="h-4 w-4 text-primary animate-spin" />
        <span className="text-sm font-medium">Nova versão disponível</span>
        <Button size="sm" onClick={reload} className="ml-1">
          Atualizar
        </Button>
      </div>
    </div>
  );
}
