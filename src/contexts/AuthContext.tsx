import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../utils/supabase';

interface AuthContextType {
  userId: string | null;
  organizationId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        await fetchOrganizationId(session.user.id);
      } else {
        setUserId(null);
        setOrganizationId(null);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const fetchOrganizationId = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch organization:', error);
        return;
      }

      if (data) {
        setOrganizationId(data.organization_id);
      }
    } catch (error) {
      console.error('Error fetching organization:', error);
    }
  };

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        await fetchOrganizationId(session.user.id);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) throw error;
    if (data.user) {
      setUserId(data.user.id);
      await fetchOrganizationId(data.user.id);
    }
  };

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (data.user) {
      setUserId(data.user.id);
      await fetchOrganizationId(data.user.id);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUserId(null);
    setOrganizationId(null);
  };

  return (
    <AuthContext.Provider
      value={{
        userId,
        organizationId,
        isAuthenticated: !!userId,
        isLoading,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
