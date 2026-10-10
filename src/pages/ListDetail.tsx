import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Users, UserPlus, LogOut } from "lucide-react";
import type { RoviaList, Visibility } from "../types";
import { db, fail } from "../services/supabase";
import { rpc, people, catalog, withRatings } from "../services/api";
import { useApp, useDebounce } from "../hooks/useApp";
import {
  PageTitle,
  Loading,
  ErrorState,
  Empty,
  PlaceCard,
  Modal,
} from "../components/UI";
export default function ListDetail() {
  const { id = "" } = useParams();
  const { session, invalidate, notice, requireAuth } = useApp();
  const navigate = useNavigate();
  const [modal, setModal] = useState<"edit" | "invite" | "place" | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("reader");
  const debounced = useDebounce(search);
  const list = useQuery({
    queryKey: ["list", id, session?.user.id],
    queryFn: async () => {
      const { data, error } = await db()
        .from("lists")
        .select(
          "*,list_places(place_id,places(*)),list_members(user_id,role,status,profiles(username,display_name))",
        )
        .eq("id", id)
        .maybeSingle();
      fail(error);
      if (!data) return null;
      const l = data as RoviaList;
      const rows =
        l.list_places?.flatMap((i) => (i.places ? [i.places] : [])) ?? [];
      const rated = await withRatings(rows);
      const byId = new Map(rated.map((p) => [p.id, p]));
      return {
        ...l,
        list_places: l.list_places?.map((i) => ({
          ...i,
          places: byId.get(i.place_id),
        })),
      };
    },
    refetchInterval: 30000,
  });
  const users = useQuery({
    queryKey: ["people-invite", debounced],
    enabled: modal === "invite" && debounced.length > 1,
    queryFn: () => people(debounced),
  });
  const places = useQuery({
    queryKey: ["add-place", debounced],
    enabled: modal === "place" && debounced.length > 1,
    queryFn: async () => {
      const { data, error } = await db()
        .from("places")
        .select("*")
        .ilike("name", `%${debounced}%`)
        .is("merged_into", null)
        .is("archived_at", null)
        .eq("closed", false)
        .limit(20);
      fail(error);
      return data;
    },
  });
  const mutation = useMutation<void, Error, () => Promise<unknown>>({
    mutationFn: async (fn) => {
      await fn();
    },
    onSuccess: () => {
      void invalidate();
      notice("Cambios guardados.");
    },
    onError: (e) => notice(e.message),
  });
  if (list.isPending) return <Loading />;
  if (list.isError)
    return (
      <div className="content-page">
        <ErrorState error={list.error} />
      </div>
    );
  const l = list.data;
  if (!l)
    return (
      <div className="content-page">
        <Empty title="Lista no disponible">
          <p>
            La lista puede ser privada, haberse eliminado o haber cambiado sus
            permisos.
          </p>
        </Empty>
      </div>
    );
  const own = session?.user.id === l.owner_id;
  const member = l.list_members?.find(
    (m) => m.user_id === session?.user.id && m.status === "accepted",
  );
  const editor = own || member?.role === "editor";
  const run = (fn: () => Promise<unknown>) => {
    if (requireAuth()) mutation.mutate(fn);
  };
  return (
    <div className="content-page">
      <Link className="back-link" to="/guardados?tab=lists">
        <ArrowLeft size={17} />
        Volver a mis listas
      </Link>
      <PageTitle
        eyebrow={`${l.visibility === "private" ? "PRIVADA" : l.visibility === "friends" ? "PARA AMIGOS" : "PÚBLICA"} · ${own ? "PROPIETARIO" : member?.role === "editor" ? "EDITOR" : member?.role === "reader" ? "LECTOR" : "VISITANTE"}`}
        title={l.name}
        description={l.description || "Lugares para un próximo plan."}
        action={
          editor && (
            <button
              className="button primary"
              onClick={() => {
                setSearch("");
                setModal("place");
              }}
            >
              <Plus size={18} />
              Sumar un lugar
            </button>
          )
        }
      />
      <div className="button-row">
        {(own || member) && (
          <Link className="button secondary" to={`/?map=mine&list=${l.id}`}>
            Ver esta lista en Mi mapa
          </Link>
        )}
        {own && (
          <>
            <button
              className="button secondary"
              onClick={() => setModal("edit")}
            >
              Editar lista
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setSearch("");
                setModal("invite");
              }}
            >
              <UserPlus size={17} />
              Invitar persona
            </button>
            <button
              className="text-button"
              onClick={() => {
                if (
                  confirm(
                    `¿Eliminar “${l.name}”? Se perderá el acceso para sus miembros.`,
                  )
                )
                  run(async () => {
                    const { error } = await db()
                      .from("lists")
                      .delete()
                      .eq("id", id);
                    fail(error);
                    navigate("/guardados?tab=lists");
                  });
              }}
            >
              <Trash2 size={16} />
              Eliminar
            </button>
          </>
        )}
        {member && !own && (
          <button
            className="button secondary"
            onClick={() => {
              if (confirm("¿Abandonar esta lista?"))
                run(async () => {
                  await rpc("member_action", {
                    lid: id,
                    target: session!.user.id,
                    action: "leave",
                  });
                  navigate("/guardados?tab=lists");
                });
            }}
          >
            <LogOut size={17} />
            Abandonar lista
          </button>
        )}
      </div>
      <p className="help">
        El propietario administra miembros y privacidad. Los editores suman o
        quitan lugares; los lectores consultan. La lista no concede acceso al
        perfil del propietario.
      </p>
      {l.list_places?.length ? (
        <div className="saved-grid">
          {l.list_places.map(
            (i) =>
              i.places && (
                <div key={i.place_id}>
                  <PlaceCard
                    place={i.places}
                    onSelect={(p) => navigate(`/local/${p.id}`)}
                  />
                  {editor && (
                    <button
                      className="text-button"
                      onClick={() =>
                        run(async () => {
                          const { error } = await db()
                            .from("list_places")
                            .delete()
                            .eq("list_id", id)
                            .eq("place_id", i.place_id);
                          fail(error);
                        })
                      }
                    >
                      <Trash2 size={15} />
                      Quitar de la lista
                    </button>
                  )}
                </div>
              ),
          )}
        </div>
      ) : (
        <Empty title="El primer lugar inicia el plan" icon="bookmark">
          <p>Esta lista todavía no tiene lugares.</p>
          {editor && (
            <button
              className="button primary"
              onClick={() => setModal("place")}
            >
              Buscar un lugar
            </button>
          )}
        </Empty>
      )}
      {(own || member) && (
        <section className="members-section">
          <h2>
            <Users size={20} />
            Miembros
          </h2>
          <p>
            Propietario:{" "}
            <Link className="text-link" to={`/persona/${l.owner_id}`}>
              Ver perfil
            </Link>
          </p>
          {l.list_members?.map((m) => (
            <div key={m.user_id} className="member-row">
              <Link to={`/persona/${m.user_id}`}>
                {m.profiles?.display_name || "Persona invitada"}
              </Link>
              <span>
                {m.status === "pending"
                  ? "Invitación pendiente"
                  : m.role === "editor"
                    ? "Editor"
                    : "Lector"}
              </span>
              {own && (
                <>
                  <select
                    aria-label={`Rol de ${m.profiles?.display_name}`}
                    value={m.role}
                    onChange={(e) =>
                      run(() =>
                        rpc("member_action", {
                          lid: id,
                          target: m.user_id,
                          action: "role",
                          new_role: e.target.value,
                        }),
                      )
                    }
                  >
                    <option value="reader">Lector</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    className="icon-button"
                    aria-label="Retirar miembro"
                    onClick={() => {
                      if (confirm("¿Retirar a esta persona de la lista?"))
                        run(() =>
                          rpc("member_action", {
                            lid: id,
                            target: m.user_id,
                            action: "remove",
                          }),
                        );
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </>
              )}
            </div>
          ))}
        </section>
      )}
      {modal === "edit" && (
        <Modal title="Editar lista" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                const { error } = await db()
                  .from("lists")
                  .update({
                    name: f.get("name"),
                    description: f.get("description"),
                    visibility: f.get("visibility"),
                  })
                  .eq("id", id);
                fail(error);
                setModal(null);
              });
            }}
          >
            <label>
              Nombre
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={l.name}
              />
            </label>
            <label>
              Descripción
              <textarea
                name="description"
                maxLength={300}
                defaultValue={l.description ?? ""}
              />
            </label>
            <label>
              Visibilidad
              <select name="visibility" defaultValue={l.visibility}>
                <option value="private">Privada</option>
                <option value="friends">Amigos</option>
                <option value="public">Pública</option>
              </select>
            </label>
            <button className="button primary" disabled={mutation.isPending}>
              Guardar cambios
            </button>
          </form>
        </Modal>
      )}
      {modal === "invite" && (
        <Modal title="Invitar a una persona" onClose={() => setModal(null)}>
          <label>
            Buscar por nombre o usuario
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscá una persona registrada"
            />
          </label>
          <label>
            Rol
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="reader">Lector</option>
              <option value="editor">Editor</option>
            </select>
          </label>
          {users.isError && <ErrorState error={users.error} />}{" "}
          {users.data
            ?.filter((u) => u.id !== l.owner_id)
            .map((u) => (
              <button
                className="list-select"
                key={u.id}
                disabled={
                  mutation.isPending ||
                  l.list_members?.some((m) => m.user_id === u.id)
                }
                onClick={() =>
                  run(() =>
                    rpc("member_action", {
                      lid: id,
                      target: u.id,
                      action: "invite",
                      new_role: role,
                    }),
                  )
                }
              >
                {u.display_name} <UserPlus size={17} />
              </button>
            ))}
        </Modal>
      )}
      {modal === "place" && (
        <Modal title="Sumar un lugar" onClose={() => setModal(null)}>
          <label>
            Buscar en el catálogo
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre del lugar"
            />
          </label>
          {places.isError && <ErrorState error={places.error} />}{" "}
          {places.data?.map((p) => (
            <button
              className="list-select"
              key={p.id}
              disabled={
                mutation.isPending ||
                l.list_places?.some((i) => i.place_id === p.id)
              }
              onClick={() =>
                run(async () => {
                  const { error } = await db()
                    .from("list_places")
                    .insert({ list_id: id, place_id: p.id });
                  fail(error);
                })
              }
            >
              {p.name}
              <Plus size={17} />
            </button>
          ))}
          {debounced.length > 1 && places.data?.length === 0 && (
            <p>No hay coincidencias en el catálogo importado.</p>
          )}
        </Modal>
      )}
    </div>
  );
}
