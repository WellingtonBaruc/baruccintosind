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
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UsuarioProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', userId)
        .eq('ativo', true)
        .single();
      if (error) throw error;
      setProfile(data);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    const finishLoading = () => {
      if (mounted) setLoading(false);
    };

    const applySession = async (nextSession: Session | null) => {
      if (!mounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        await fetchProfile(nextSession.user.id);
      } else {
        setProfile(null);
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
      initializedRef.current = true;
      finishLoading();
    }, 8000);

    // Listen for auth changes first to avoid race conditions during session recovery
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        await applySession(session);
      })
      .catch(async () => {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Ignore local sign out failures on session recovery
        }

        if (!mounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
        initializedRef.current = true;
        finishLoading();
      });

    return () => {
      mounted = false;
      window.clearTimeout(initializationTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      // Fetch profile after successful sign in
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await fetchProfile(user.id);
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
