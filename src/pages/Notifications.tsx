import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Check, Users, Heart, Layers } from "lucide-react";
import type { Notification } from "../types";
import { db, fail } from "../services/supabase";
import { rpc } from "../services/api";
import { useApp } from "../hooks/useApp";
import {
  PageTitle,
  AuthGate,
  Loading,
  ErrorState,
  Empty,
} from "../components/UI";
const labels: Record<string, string> = {
  friendship: "Te envió una solicitud de amistad",
  friend_accepted: "Aceptó tu solicitud de amistad",
  like_review: "Le gustó tu reseña",
  list_invite: "Te invitó a una lista",
  list_place: "Agregó un lugar a una lista compartida",
};
type Invitation = { list_id: string; name: string; role: string };
export default function Notifications() {
  const { session, invalidate, notice } = useApp();
  const notes = useQuery({
    queryKey: ["notifications", session?.user.id],
    enabled: !!session,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await db()
        .from("notifications")
        .select("*,profiles!notifications_actor_id_fkey(display_name,username)")
        .order("created_at", { ascending: false })
        .limit(100);
      fail(error);
      return data as (Notification & {
        profiles: { display_name: string; username: string };
      })[];
    },
  });
  const invites = useQuery({
    queryKey: ["invites", session?.user.id],
    enabled: !!session,
    queryFn: () => rpc("pending_invites", {}) as Promise<Invitation[]>,
  });
  const mutation = useMutation<void, Error, () => Promise<unknown>>({
    mutationFn: async (fn) => {
      await fn();
    },
    onSuccess: () => {
      void invalidate();
    },
    onError: (e) => notice(e.message),
  });
  if (!session)
    return (
      <div className="content-page">
        <AuthGate />
      </div>
    );
  return (
    <div className="content-page">
      <PageTitle
        eyebrow="NO TE PIERDAS UN PLAN"
        title="Tus notificaciones"
        description="Novedades de tu gente y de tus listas compartidas."
        action={
          <button
            className="button secondary"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(async () => {
                const { error } = await db()
                  .from("notifications")
                  .update({ read_at: new Date().toISOString() })
                  .eq("user_id", session.user.id)
                  .is("read_at", null);
                fail(error);
              })
            }
          >
            <Check size={17} />
            Marcar todas como leídas
          </button>
        }
      />
      {invites.data?.map((i) => (
        <div key={i.list_id} className="invitation">
          <Layers size={23} />
          <div>
            <strong>Invitación a {i.name}</strong>
            <p>
              Rol: {i.role === "editor" ? "editor" : "lector"}. Esta invitación
              da acceso solo a esta lista.
            </p>
          </div>
          <button
            className="button primary"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(() =>
                rpc("member_action", {
                  lid: i.list_id,
                  target: session.user.id,
                  action: "accept",
                }),
              )
            }
          >
            Aceptar
          </button>
          <button
            className="button secondary"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(() =>
                rpc("member_action", {
                  lid: i.list_id,
                  target: session.user.id,
                  action: "reject",
                }),
              )
            }
          >
            Rechazar
          </button>
        </div>
      ))}
      {notes.isPending ? (
        <Loading />
      ) : notes.isError ? (
        <ErrorState error={notes.error} />
      ) : notes.data?.length ? (
        <div className="notification-list">
          {notes.data.map((n) => (
            <article
              className={`notification-row ${n.read_at ? "" : "unread"}`}
              key={n.id}
            >
              <span className="notification-icon">
                {n.kind === "like_review" ? (
                  <Heart size={20} />
                ) : n.kind.startsWith("list") ? (
                  <Layers size={20} />
                ) : (
                  <Users size={20} />
                )}
              </span>
              <div>
                <Link className="text-link" to={`/persona/${n.actor_id}`}>
                  {n.profiles.display_name}
                </Link>
                <p>{labels[n.kind]}</p>
                <span>{new Date(n.created_at).toLocaleString("es-AR")}</span>
                <Link
                  className="text-link"
                  to={
                    n.kind === "friendship"
                      ? "/personas?tab=requests"
                      : n.kind.startsWith("list") && n.kind !== "list_invite"
                        ? `/lista/${n.reference_id}`
                        : "/perfil"
                  }
                >
                  Ver →
                </Link>
              </div>
              {!n.read_at && (
                <button
                  className="icon-button"
                  aria-label="Marcar como leída"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate(async () => {
                      const { error } = await db()
                        .from("notifications")
                        .update({ read_at: new Date().toISOString() })
                        .eq("id", n.id);
                      fail(error);
                    })
                  }
                >
                  <Check size={18} />
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty title="Todo tranquilo por acá">
          <p>
            Te avisamos cuando alguien conecte con vos o haya novedades en tus
            listas.
          </p>
        </Empty>
      )}
    </div>
  );
}
