import { NavLink, Link, Outlet } from "react-router-dom";
import {
  MapPin,
  Activity,
  Bookmark,
  Users,
  UserRound,
  Bell,
  Settings,
  ArrowUpRight,
  Shield,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../hooks/useApp";
import { db, configured, fail } from "../services/supabase";
const nav = [
  { to: "/", label: "Explorar", icon: MapPin },
  { to: "/actividad", label: "Actividad", icon: Activity },
  { to: "/guardados", label: "Guardados", icon: Bookmark },
  { to: "/personas", label: "Personas", icon: Users },
  { to: "/perfil", label: "Perfil", icon: UserRound },
];
export default function Layout() {
  const { session, adminMode, setAdminMode } = useApp();
  const unread = useQuery({
    queryKey: ["unread", session?.user.id],
    enabled: !!session,
    refetchInterval: 30000,
    queryFn: async () => {
      const { count, error } = await db()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      fail(error);
      return count ?? 0;
    },
  });
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className="header">
        <Link to="/" className="brand" aria-label="Rovia, ir a explorar">
          <span className="brand-mark">
            <img
              className="app-logo"
              src="/logo-light.svg"
              alt=""
              width="34"
              height="34"
            />
          </span>
          rovia
          <span className="brand-dot">.</span>
        </Link>
        <span className="brand-tagline">Tus lugares, con tu gente.</span>
        <div className="header-right">
          <span className="pilot">
            <span />{" "}
            {adminMode ? "Vista de administrador" : "CABA + Vicente López"}
          </span>
          <Link
            className="icon-button notification-button"
            to="/notificaciones"
            aria-label={`Notificaciones${unread.data ? `, ${unread.data} sin leer` : ""}`}
          >
            <Bell size={21} />
            {!!unread.data && <i>{unread.data}</i>}
          </Link>
          {session ? (
            <Link className="avatar" to="/perfil" aria-label="Mi perfil">
              {(session.user.user_metadata.display_name || "R").slice(0, 1)}
            </Link>
          ) : (
            <Link to="/auth" className="button primary header-login">
              Ingresar <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
      </header>
      <div className="app-body">
        <nav className="sidebar" aria-label="Navegación principal">
          {nav.map(({ to, label, icon: I }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `nav-item ${to === "/" ? "map-nav" : ""} ${isActive ? "active" : ""}`
              }
            >
              <I size={22} />
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink to="/configuracion" className="nav-item settings-link">
            <Settings size={21} />
            <span>Ajustes</span>
          </NavLink>
          {adminMode && (
            <NavLink to="/admin" className="nav-item admin-nav">
              <Shield size={21} />
              <span>Administrar</span>
            </NavLink>
          )}
          <div className="sidebar-footer">
            Salí a<br />
            descubrir<span>↗</span>
          </div>
        </nav>
        <main id="main">
          {adminMode && (
            <div className="admin-banner">
              <Shield size={16} />
              <span>Vista de administrador</span>
              <Link to="/admin">Gestionar locales</Link>
              <button onClick={() => setAdminMode(false)}>
                Volver a vista normal
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
