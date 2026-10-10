import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, UserPlus, UserCheck, Users } from "lucide-react";
import type { Profile } from "../types";
import { people, rpc, toggle } from "../services/api";
import { db, configured, fail } from "../services/supabase";
import { useApp, useDebounce } from "../hooks/useApp";
import {
  PageTitle,
  Empty,
  Loading,
  ErrorState,
  ConnectionNote,
} from "../components/UI";
export function PersonCard({
  profile,
}: {
  profile: Pick<Profile, "id" | "display_name" | "username">;
}) {
  const { session, requireAuth, invalidate, notice } = useApp();
  const relation = useQuery({
    queryKey: ["relation", profile.id, session?.user.id],
    enabled: !!session && profile.id !== session.user.id,
    queryFn: async () => {
      const [follows, friends] = await Promise.all([
        db()
          .from("follows")
          .select("*")
          .eq("follower_id", session!.user.id)
          .eq("followed_id", profile.id),
        db()
          .from("friendships")
          .select("*")
          .or(
            `and(sender_id.eq.${session!.user.id},recipient_id.eq.${profile.id}),and(sender_id.eq.${profile.id},recipient_id.eq.${session!.user.id})`,
          ),
      ]);
      fail(follows.error);
      fail(friends.error);
      return {
        following: !!follows.data?.length,
        friend: friends.data?.[0] as
          | { status: string; sender_id: string; recipient_id: string }
          | undefined,
      };
    },
  });
  const mutation = useMutation<void, Error, () => Promise<unknown>>({
    mutationFn: async (fn) => {
      await fn();
    },
    onSuccess: () => {
      void invalidate();
      notice("Relación actualizada.");
    },
    onError: (e) => notice(e.message),
  });
  const r = relation.data?.friend;
  const incoming =
    r?.status === "pending" && r.recipient_id === session?.user.id;
  function act(fn: () => Promise<unknown>) {
    if (requireAuth()) mutation.mutate(fn);
  }
  return (
    <div className="person-card">
      <Link to={`/persona/${profile.id}`} className="avatar big">
        {profile.display_name.slice(0, 1)}
      </Link>
      <div>
        <Link to={`/persona/${profile.id}`}>
          <h3>{profile.display_name}</h3>
        </Link>
        <p>@{profile.username}</p>
      </div>
      {profile.id !== session?.user.id && (
        <div className="person-actions">
          <button
            className="button secondary"
            disabled={mutation.isPending || (relation.isPending && !!session)}
            onClick={() =>
              act(() =>
                toggle(
                  "follows",
                  "followed_id",
                  profile.id,
                  !!relation.data?.following,
                  session!.user.id,
                ),
              )
            }
          >
            {relation.data?.following ? "Siguiendo" : "Seguir"}
          </button>
          <button
            className="button secondary"
            disabled={mutation.isPending}
            onClick={() => {
              if (
                r?.status === "accepted" &&
                !confirm(
                  "¿Eliminar esta amistad? Perderán acceso al contenido para amigos.",
                )
              )
                return;
              act(() =>
                rpc("friend_action", {
                  target: profile.id,
                  action:
                    r?.status === "accepted"
                      ? "remove"
                      : incoming
                        ? "accept"
                        : r
                          ? "cancel"
                          : "request",
                }),
              );
            }}
          >
            {r?.status === "accepted" ? (
              <>
                <UserCheck size={16} />
                Amigos
              </>
            ) : incoming ? (
              "Aceptar"
            ) : r ? (
              "Cancelar solicitud"
            ) : (
              <>
                <UserPlus size={16} />
                Agregar amigo
              </>
            )}
          </button>
          {incoming && (
            <button
              className="text-button"
              onClick={() =>
                act(() =>
                  rpc("friend_action", {
                    target: profile.id,
                    action: "reject",
                  }),
                )
              }
            >
              Rechazar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export default function People() {
  const [text, setText] = useState("");
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "search";
  const setTab = (v: string) => setParams({ tab: v });
  const search = useDebounce(text);
  const { session } = useApp();
  const results = useQuery({
    queryKey: ["people", search, tab, session?.user.id],
    enabled: configured,
    queryFn: async () => {
      if (tab === "search") return people(search);
      if (!session) return [];
      if (tab === "following" || tab === "followers") {
        const { data, error } = await db()
          .from("follows")
          .select(
            tab === "following"
              ? "profiles!follows_followed_id_fkey(*)"
              : "profiles!follows_follower_id_fkey(*)",
          )
          .eq(
            tab === "following" ? "follower_id" : "followed_id",
            session.user.id,
          )
          .limit(50);
        fail(error);
        return (data as unknown as { profiles: Profile }[]).map(
          (d) => d.profiles,
        );
      }
      const { data, error } = await db()
        .from("friendships")
        .select("*")
        .or(
          `sender_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`,
        )
        .eq("status", tab === "requests" ? "pending" : "accepted")
        .limit(50);
      fail(error);
      const ids = (data ?? []).map((r) =>
        r.sender_id === session.user.id ? r.recipient_id : r.sender_id,
      );
      if (!ids.length) return [];
      const { data: p, error: e } = await db()
        .from("profiles")
        .select("*")
        .in("id", ids);
      fail(e);
      return p as Profile[];
    },
  });
  return (
    <div className="content-page">
      <PageTitle
        eyebrow="LOS LUGARES SON MEJORES CON TU GENTE"
        title="Conectá con tu gente"
        description="Seguí sus experiencias públicas. Agregá amigos para compartir un poco más."
      />
      <label className="search-input people-search">
        <Search size={19} />
        <input
          aria-label="Buscar personas"
          placeholder="Buscar por nombre o @usuario"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTab("search");
          }}
        />
      </label>
      <div className="tabs">
        {[
          ["search", "Descubrir"],
          ["friends", "Amigos"],
          ["requests", "Solicitudes"],
          ["following", "Seguidos"],
          ["followers", "Seguidores"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="privacy-callout">
        <Users size={21} />
        <p>
          <strong>Seguir y ser amigos son distintos.</strong>
          <br />
          Seguir muestra actividad pública. La amistad requiere aceptación y
          permite ver lo compartido para amigos.
        </p>
      </div>
      <ConnectionNote />
      {!configured ? (
        <Empty title="Tu comunidad empieza con una cuenta">
          <p>
            Las personas reales aparecerán cuando conectes Supabase y se
            registren.
          </p>
        </Empty>
      ) : results.isPending ? (
        <Loading />
      ) : results.isError ? (
        <ErrorState error={results.error} />
      ) : results.data?.length ? (
        <div className="people-list">
          {results.data.map((p) => (
            <PersonCard key={p.id} profile={p} />
          ))}
        </div>
      ) : (
        <Empty title="Todavía no hay personas para mostrar">
          <p>
            {tab === "search"
              ? "Probá otro nombre de usuario."
              : "Buscá una persona para conectar."}
          </p>
        </Empty>
      )}
    </div>
  );
}
