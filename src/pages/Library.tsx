import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Bookmark,
  Heart,
  Check,
  Layers,
  Users,
  ArrowUpRight,
  Lock,
} from "lucide-react";
import type { Place, Visibility } from "../types";
import { db, fail } from "../services/supabase";
import { ownLists, withRatings } from "../services/api";
import { useApp } from "../hooks/useApp";
import {
  AuthGate,
  PageTitle,
  Modal,
  Empty,
  Loading,
  ErrorState,
  PlaceCard,
} from "../components/UI";
export default function Library() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "saved";
  const { session, invalidate, notice } = useApp();
  const navigate = useNavigate();
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const query = useQuery({
    queryKey: ["library", tab, session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const table =
        tab === "want"
          ? "want_places"
          : tab === "visited"
            ? "visits"
            : "saved_places";
      const { data, error } = await db()
        .from(table)
        .select("place_id,places(*)")
        .eq("user_id", session!.user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      fail(error);
      const rows = data as unknown as { place_id: string; places: Place }[];
      const rated = await withRatings(rows.map((r) => r.places));
      return rows.map((r, i) => ({ ...r, places: rated[i] }));
    },
  });
  const lists = useQuery({
    queryKey: ["lists", session?.user.id],
    queryFn: ownLists,
    enabled: !!session,
  });
  const add = useMutation({
    mutationFn: async () => {
      const { data, error } = await db()
        .from("lists")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          visibility,
        })
        .select()
        .single();
      fail(error);
      return data;
    },
    onSuccess: (data) => {
      setCreate(false);
      void invalidate();
      notice("Lista creada.");
      navigate(`/lista/${data.id}`);
    },
    onError: (e) => notice(e.message),
  });
  if (!session)
    return (
      <div className="content-page">
        <PageTitle
          eyebrow="TUS PRÓXIMOS PLANES"
          title="Lugares que quedan"
          description="Guardá ideas para cuando llegue el momento."
        />
        <AuthGate />
      </div>
    );
  const tabs = [
    { id: "saved", label: "Guardados", I: Bookmark },
    { id: "want", label: "Quiero ir", I: Heart },
    { id: "visited", label: "Ya fui", I: Check },
    { id: "lists", label: "Mis listas", I: Layers },
  ];
  return (
    <div className="content-page">
      <PageTitle
        eyebrow="TUS PRÓXIMOS PLANES"
        title="Lugares que quedan"
        description="Un café pendiente, una salida con amigos, una historia para volver."
        action={
          <button className="button primary" onClick={() => setCreate(true)}>
            <Plus size={18} />
            Nueva lista
          </button>
        }
      />
      <div className="tabs">
        {tabs.map(({ id, label, I }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setParams({ tab: id })}
          >
            <I size={17} />
            {label}
          </button>
        ))}
      </div>
      {tab === "lists" ? (
        lists.isPending ? (
          <Loading />
        ) : lists.isError ? (
          <ErrorState error={lists.error} />
        ) : lists.data?.length ? (
          <div className="list-grid">
            {lists.data.map((l) => (
              <Link className="list-card" to={`/lista/${l.id}`} key={l.id}>
                <div className="list-cover">
                  <Layers size={34} />
                  <span>{l.list_places?.length ?? 0} lugares</span>
                  <ArrowUpRight size={20} />
                </div>
                <div>
                  <h2>{l.name}</h2>
                  <p>{l.description || "Una colección de próximos planes."}</p>
                  <span className="visibility-tag">
                    {l.visibility === "private" ? (
                      <Lock size={14} />
                    ) : (
                      <Users size={14} />
                    )}{" "}
                    {l.visibility === "private"
                      ? "Privada"
                      : l.visibility === "friends"
                        ? "Para amigos"
                        : "Pública"}
                    {l.list_members?.length ? " · Colaborativa" : ""}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="Una lista, muchas posibilidades" icon="bookmark">
            <p>
              Creá una colección para tu próximo plan y, si querés, invitales a
              tus amigos.
            </p>
            <button className="button primary" onClick={() => setCreate(true)}>
              Crear mi primera lista
            </button>
          </Empty>
        )
      ) : query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data?.length ? (
        <div className="saved-grid">
          {query.data.map((i) => (
            <PlaceCard
              key={i.place_id}
              place={i.places}
              onSelect={(p) => navigate(`/local/${p.id}`)}
            />
          ))}
        </div>
      ) : (
        <Empty
          title={
            tab === "visited"
              ? "Cada salida cuenta"
              : tab === "want"
                ? "Dejá un plan pendiente"
                : "Guardá tu primer descubrimiento"
          }
          icon="bookmark"
        >
          <p>
            {tab === "visited"
              ? "Marcá “Ya fui” desde una ficha, sin obligación de reseñar."
              : "Explorá el mapa y elegí un lugar que quieras recordar."}
          </p>
          <Link className="button primary" to="/">
            Explorar lugares
          </Link>
        </Empty>
      )}
      {create && (
        <Modal
          title="Una lista para tu próximo plan"
          onClose={() => setCreate(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <label>
              Nombre
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cafés para una tarde de lluvia"
              />
            </label>
            <label>
              Descripción opcional
              <textarea
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label>
              Visibilidad
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as Visibility)}
              >
                <option value="private">Privada</option>
                <option value="friends">Amigos</option>
                <option value="public">Pública</option>
              </select>
            </label>
            <p className="help">
              Los miembros aceptados acceden a esta lista aunque sea privada.
            </p>
            <button className="button primary" disabled={add.isPending}>
              Crear lista
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
