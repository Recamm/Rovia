import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase, configured, db, fail } from "../services/supabase";
type AppContext = {
  session: Session | null;
  ready: boolean;
  notice: (s: string) => void;
  requireAuth: () => boolean;
  invalidate: () => Promise<void>;
  isAdmin: boolean;
  adminMode: boolean;
  setAdminMode: (active: boolean) => void;
};
const Context = createContext<AppContext | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);
  const [message, setMessage] = useState("");
  const [adminMode, setAdmin] = useState(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const admin = useQuery({
    queryKey: ["admin-role", session?.user.id],
    enabled: !!session,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await db().rpc("is_admin");
      fail(error);
      return data as boolean;
    },
  });
  const isAdmin = !!session && admin.data === true;
  useEffect(() => {
    if (!isAdmin) setAdmin(false);
  }, [isAdmin, session?.user.id]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      client.clear();
      setSession(next);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, [client]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5500);
    return () => clearTimeout(timer);
  }, [message]);
  const notice = (s: string) => setMessage(s);
  const requireAuth = () => {
    if (session) return true;
    navigate(
      `/auth?next=${encodeURIComponent(location.pathname + location.search)}`,
    );
    return false;
  };
  return (
    <Context.Provider
      value={{
        session,
        ready,
        notice,
        requireAuth,
        isAdmin,
        adminMode: isAdmin && adminMode,
        setAdminMode: (active) => {
          if (isAdmin) setAdmin(active);
        },
        invalidate: async () => {
          await client.invalidateQueries();
        },
      }}
    >
      {children}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error("AppProvider requerido");
  return context;
}
export function useDebounce<T>(value: T, ms = 300) {
  const [result, set] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => set(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return result;
}
