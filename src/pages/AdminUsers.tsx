import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useApp } from "../hooks/useApp";
import { db, fail } from "../services/supabase";
import { AuthGate, ErrorState, Loading, Empty } from "../components/UI";
type AdminUser = {
  id: string;
  email: string;
  created_at: string;
  banned_until?: string;
  is_admin: boolean;
  profile?: { username: string; display_name: string };
};
async function invoke(body: Record<string, unknown>) {
  const { data, error } = await db().functions.invoke("admin-users", { body });
  if (error) {
    try {
      const payload = await error.context.json();
      throw new Error(payload.error ?? error.message);
    } catch (e) {
      throw e instanceof Error
        ? e
        : new Error("No pudimos completar la operación.");
    }
  }
  fail(error);
  if (data?.error) throw new Error(data.error);
  return data;
}
export default function AdminUsers() {
  const { session, isAdmin, adminMode, setAdminMode, invalidate, notice } =
    useApp();
  const [page, setPage] = useState(1),
    [email, setEmail] = useState(""),
    [username, setUsername] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [search, setSearch] = useState("");
  const permitted = !!session && isAdmin && adminMode;
  const users = useQuery({
    queryKey: ["admin-users", session?.user.id, page],
    enabled: permitted,
    queryFn: async () =>
      (await invoke({ action: "list", page })) as {
        users: AdminUser[];
        has_more: boolean;
        lifecycle_enabled: boolean;
      },
  });
  const action = useMutation({
    mutationFn: invoke,
    onSuccess: () => {
      void invalidate();
      notice("Operación completada.");
      setPassword("");
    },
    onError: (e) => notice(e.message),
  });
  if (!session)
    return (
      <div className="content-page">
        <AuthGate />
      </div>
    );
  if (!isAdmin)
    return (
      <div className="content-page">
        <Empty title="Acceso de administrador requerido" />
      </div>
    );
  if (!adminMode)
    return (
      <div className="content-page">
        <button className="button primary" onClick={() => setAdminMode(true)}>
          Activar vista de administrador
        </button>
      </div>
    );
  return (
    <div className="content-page">
      <Link className="back-link" to="/admin">
        Volver a administrar locales
      </Link>
      <h1>Usuarios de Rovia</h1>
      <p className="muted">
        Las contraseñas se recuperan por enlace; no se muestran contraseñas
        actuales.
      </p>
      <details className="review-card">
        <summary>Crear una cuenta</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({
              action: "create",
              email,
              username,
              display_name: name,
              password,
            });
          }}
        >
          <label>
            Correo
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Usuario
            <input
              required
              pattern="[a-z0-9_]{3,24}"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
            />
          </label>
          <label>
            Nombre
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Contraseña temporal
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <p className="help">
            La persona puede cambiarla desde Configuración o recuperar su cuenta
            por correo.
          </p>
          <button className="button primary" disabled={action.isPending}>
            Crear cuenta
          </button>
        </form>
      </details>
      {!users.data?.lifecycle_enabled && (
        <p className="help">
          La suspensión y eliminación están pendientes de habilitación. Podés
          crear cuentas, administrar roles y enviar enlaces de recuperación.
        </p>
      )}
      <label>
        Filtrar esta página
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Correo, nombre o usuario"
        />
      </label>
      {action.isError && <ErrorState error={action.error} />}
      {users.isPending ? (
        <Loading />
      ) : users.isError ? (
        <ErrorState error={users.error} />
      ) : (
        users.data.users
          .filter((u) =>
            [u.email, u.profile?.username, u.profile?.display_name]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((u) => {
            const banned =
              !!u.banned_until && new Date(u.banned_until) > new Date();
            return (
              <article className="review-card admin-user" key={u.id}>
                <div>
                  <Link to={`/persona/${u.id}`}>
                    <strong>{u.profile?.display_name ?? "Usuario"}</strong>
                  </Link>
                  <p>{u.email}</p>
                  <small>
                    @{u.profile?.username} ·{" "}
                    {u.is_admin
                      ? "Administrador"
                      : banned
                        ? "Suspendido"
                        : "Cuenta activa"}
                  </small>
                </div>
                <div className="admin-user-actions">
                  <button
                    className="button secondary"
                    disabled={action.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `¿Enviar un enlace de recuperación a ${u.email}?`,
                        )
                      )
                        action.mutate({ action: "reset", user_id: u.id });
                    }}
                  >
                    Recuperar contraseña
                  </button>
                  <button
                    className="button secondary"
                    disabled={action.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `${u.is_admin ? "Retirar" : "Dar"} permiso de administrador a ${u.email}?`,
                        )
                      )
                        action.mutate({
                          action: "role",
                          user_id: u.id,
                          enabled: !u.is_admin,
                        });
                    }}
                  >
                    {u.is_admin ? "Retirar admin" : "Hacer admin"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={
                      action.isPending ||
                      !users.data.lifecycle_enabled ||
                      u.is_admin ||
                      u.id === session.user.id
                    }
                    onClick={() => {
                      if (
                        confirm(
                          `${banned ? "Restaurar" : "Suspender"} a ${u.email}?`,
                        )
                      )
                        action.mutate({
                          action: banned ? "restore" : "suspend",
                          user_id: u.id,
                        });
                    }}
                  >
                    {banned ? "Restaurar" : "Suspender"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={
                      action.isPending ||
                      !users.data.lifecycle_enabled ||
                      u.is_admin ||
                      u.id === session.user.id
                    }
                    onClick={() => {
                      const confirmation = prompt(
                        `Elimina permanentemente la cuenta, sus reseñas, publicaciones, fotos y listas propias. Escribí ${u.email} para confirmar.`,
                      );
                      if (confirmation === u.email)
                        action.mutate({
                          action: "delete",
                          user_id: u.id,
                          confirm_email: confirmation,
                        });
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </article>
            );
          })
      )}
      <div className="tabs">
        <button
          disabled={page === 1 || users.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          disabled={!users.data?.has_more || users.isFetching}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
