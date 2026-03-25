import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type PerfilUsuario = 'admin' | 'gestor' | 'supervisor_producao' | 'operador_producao' | 'comercial' | 'financeiro' | 'logistica' | 'loja' | 'almoxarifado';

export interface UsuarioProfile {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  setor: string | null;
  ativo: boolean;
  kanban_producao_acesso: boolean;
  kanban_venda_acesso: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UsuarioProfile | null;
  loading: boolean;
  connectionError: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  retryConnection: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const FETCH_TIMEOUT_MS = 5_000;
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1_000, 2_000];

async function fetchProfileWithTimeout(userId: string, signal?: AbortSignal): Promise<UsuarioProfile | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Chain external signal to our controller
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .eq('ativo', true)
      .abortSignal(controller.signal)
      .single();

    if (error) throw error;
    return data as UsuarioProfile;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchProfileWithRetry(userId: string): Promise<{ profile: UsuarioProfile | null; failed: boolean }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const profile = await fetchProfileWithTimeout(userId);
      return { profile, failed: false };
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }
  return { profile: null, failed: true };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UsuarioProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const initializedRef = useRef(false);

  const loadProfile = async (userId: string) => {
    const { profile: p, failed } = await fetchProfileWithRetry(userId);
    setProfile(p);
    setConnectionError(failed);
    return { failed };
  };

  const initialize = () => {
    let mounted = true;

    const finishLoading = () => {
      if (mounted) setLoading(false);
    };

    const applySession = async (nextSession: Session | null) => {
      if (!mounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setConnectionError(false);
      }

      initializedRef.current = true;
      finishLoading();
    };

    const initializationTimeout = window.setTimeout(async () => {
      if (initializedRef.current || !mounted) return;

      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Ignore local sign out failures on timeout fallback
      }

      setSession(null);
      setUser(null);
      setProfile(null);
      setConnectionError(true);
      initializedRef.current = true;
      finishLoading();
    }, 8_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(async ({ data: { session: s } }) => {
        await applySession(s);
      })
      .catch(async () => {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Ignore
        }

        if (!mounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
        setConnectionError(true);
        initializedRef.current = true;
        finishLoading();
      });

    return () => {
      mounted = false;
      window.clearTimeout(initializationTimeout);
      subscription.unsubscribe();
    };
  };

  useEffect(() => {
    return initialize();
  }, []);

  const retryConnection = () => {
    setLoading(true);
    setConnectionError(false);
    initializedRef.current = false;
    // Re-run initialization
    const cleanup = initialize();
    // We don't track the new cleanup in useEffect — it auto-cleans on unmount
    // This is fine for a manual retry triggered by user action
    return cleanup;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) await loadProfile(u.id);
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setConnectionError(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, connectionError, signIn, signOut, retryConnection }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
