import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LogOut,
  Shield,
  Database,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import type { Visibility } from "../types";
import { publicProfile } from "../services/api";
import { db, configured, fail } from "../services/supabase";
import { useApp } from "../hooks/useApp";
import { validateUsername } from "../domain/rules";
import { PageTitle, ErrorState, Loading } from "../components/UI";
import { useTheme, type ThemePreference } from "../hooks/useTheme";
export default function Settings() {
  const { preference, setPreference } = useTheme();
  const { session, invalidate, notice, isAdmin, adminMode, setAdminMode } =
    useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("friends");
  const [visits, setVisits] = useState<Visibility>("friends");
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const profile = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: () => publicProfile(session!.user.id),
  });
  const moderation = useQuery({
    queryKey: ["moderator", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await db().rpc("is_moderator");
      fail(error);
      return data as boolean;
    },
  });
  const preferences = useQuery({
    queryKey: ["preferences", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await db()
        .from("notification_preferences")
        .select("*")
        .single();
      fail(error);
      return data as Record<string, boolean>;
    },
  });
  useEffect(() => {
    const p = profile.data;
    if (p) {
      setName(p.display_name);
      setUsername(p.username);
      setBio(p.bio ?? "");
      setVisibility(p.visibility);
      setVisits(p.visit_visibility);
    }
  }, [profile.data]);
  const save = useMutation({
    mutationFn: async () => {
      if (!validateUsername(username))
        throw new Error(
          "Usuario inválido: 3 a 24 letras minúsculas, números o guiones bajos.",
        );
      const { error: a } = await db()
        .from("profiles")
        .update({ display_name: name.trim(), username: username.toLowerCase() })
        .eq("id", session!.user.id);
      fail(a);
      const { error: b } = await db()
        .from("profile_details")
        .update({ bio, visibility, visit_visibility: visits })
        .eq("id", session!.user.id);
      fail(b);
    },
    onSuccess: () => {
      void invalidate();
      notice("Perfil y privacidad actualizados.");
    },
    onError: (e) => setError(e.message),
  });
  return (
    <div className="content-page narrow settings-page">
      <PageTitle
        eyebrow="A TU MANERA"
        title="Tu cuenta y tu privacidad"
        description="Vos elegís qué compartís y con quién."
      />
      <section className="theme-control">
        <h2>Apariencia</h2>
        <label>
          Tema de Rovia
          <select
            value={preference}
            onChange={(e) => setPreference(e.target.value as ThemePreference)}
          >
            <option value="system">Usar el tema del dispositivo</option>
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </select>
        </label>
        <p className="help">
          El ícono de instalación usa el tema seleccionado. En iPhone, para
          actualizar un ícono ya instalado puede ser necesario quitar Rovia de
          inicio y agregarla de nuevo.
        </p>
      </section>
      {session ? (
        <>
          <h2>Tu perfil</h2>
          {profile.isPending ? (
            <Loading />
          ) : profile.isError ? (
            <ErrorState error={profile.error} />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                save.mutate();
              }}
            >
              <label>
                Nombre visible
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Nombre de usuario
                <input
                  required
                  minLength={3}
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
              </label>
              <label>
                Biografía
                <textarea
                  maxLength={300}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </label>
              <label>
                Avatar opcional
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      setError("El avatar debe pesar hasta 5 MB.");
                      return;
                    }
                    const body = new FormData();
                    body.set("mode", "avatar");
                    body.set("file", file);
                    const { error: uploadError } = await db().functions.invoke(
                      "image-upload",
                      { body },
                    );
                    if (uploadError) setError("No pudimos subir el avatar.");
                    else {
                      notice("Avatar actualizado.");
                      void invalidate();
                    }
                  }}
                />
              </label>
              <h2>
                <Shield size={21} />
                Quién puede ver tu actividad
              </h2>
              <label>
                Privacidad del perfil
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as Visibility)}
                >
                  <option value="friends">Mis amigos</option>
                  <option value="public">Público</option>
                  <option value="private">Solo yo</option>
                </select>
              </label>
              <label>
                Privacidad general de visitas
                <select
                  value={visits}
                  onChange={(e) => setVisits(e.target.value as Visibility)}
                >
                  <option value="friends">Mis amigos</option>
                  <option value="public">Públicas</option>
                  <option value="private">Solo yo</option>
                </select>
              </label>
              <div className="privacy-callout">
                <Shield size={21} />
                <p>
                  El perfil limita reseñas, visitas y listas. Cada contenido
                  puede restringirse aún más. Los miembros aceptados conservan
                  el acceso específico a sus listas colaborativas.
                </p>
              </div>
              {error && <ErrorState error={new Error(error)} />}
              <button className="button primary" disabled={save.isPending}>
                Guardar cambios
              </button>
            </form>
          )}
          <h2>Cambiar contraseña</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await db().auth.updateUser({
                password: newPassword,
              });
              if (error) notice(error.message);
              else {
                notice("Contraseña actualizada.");
                setNewPassword("");
              }
            }}
          >
            <label>
              Nueva contraseña
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <button className="button secondary">Cambiar contraseña</button>
          </form>
          <h2>Notificaciones dentro de Rovia</h2>
          {preferences.data &&
            Object.entries({
              friendship: "Solicitudes y amistades",
              like_review: "Likes en tus reseñas",
              list_invite: "Invitaciones a listas",
              list_place: "Nuevos lugares en listas",
            }).map(([key, label]) => (
              <label className="checkbox notification-preference" key={key}>
                <input
                  type="checkbox"
                  checked={!!preferences.data[key]}
                  onChange={async (e) => {
                    const { error } = await db()
                      .from("notification_preferences")
                      .update({ [key]: e.target.checked })
                      .eq("user_id", session.user.id);
                    if (error) notice(error.message);
                    else void invalidate();
                  }}
                />
                {label}
              </label>
            ))}
          <div className="button-row">
            <Link className="button secondary" to="/auth/reset">
              Cambiar contraseña
            </Link>
            <button
              className="button secondary"
              onClick={async () => {
                const { error } = await db().auth.signOut();
                if (error) notice(error.message);
                else notice("Sesión cerrada.");
              }}
            >
              <LogOut size={17} />
              Cerrar sesión
            </button>
          </div>
          {moderation.data && (
            <Link className="button secondary" to="/moderacion">
              <Shield size={18} />
              Abrir moderación
            </Link>
          )}
          {isAdmin && (
            <section className="admin-settings-card">
              <Shield size={24} />
              <div>
                <h2>Administración de Rovia</h2>
                <p>
                  Tu cuenta conserva todas sus funciones. Activá esta vista para
                  revisar propuestas y administrar locales.
                </p>
                <button
                  className="button primary"
                  onClick={() => {
                    setAdminMode(!adminMode);
                    if (!adminMode) navigate("/admin");
                  }}
                >
                  {adminMode
                    ? "Volver a vista normal"
                    : "Alternar a vista de administrador"}
                </button>
              </div>
            </section>
          )}
        </>
      ) : (
        <Link className="button primary" to="/auth">
          {configured
            ? "Ingresar para configurar mi perfil"
            : "Ver formulario de acceso"}
        </Link>
      )}
      <section className="about-data">
        <h2>Un catálogo abierto, una comunidad propia</h2>
        <p>
          Datos de OpenStreetMap, con licencia ODbL. La cobertura inicial es
          parcial y los atributos pueden faltar o estar desactualizados. No
          incluimos puntajes, fotos o experiencias inventadas.
        </p>
        <a
          className="text-link"
          href="https://www.openstreetmap.org/copyright/es"
          target="_blank"
          rel="noreferrer"
        >
          Licencia y atribución de OSM <ExternalLink size={15} />
        </a>
        <p>
          El proveedor de teselas es configurable. El uso de los servidores
          públicos de OSM debe respetar sus condiciones; para ampliar el piloto
          elegí un proveedor adecuado al tráfico.
        </p>
      </section>
    </div>
  );
}
