import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useInfiniteQuery, useMutation } from "@tanstack/react-query";
import type L from "leaflet";
import {
  Shield,
  Plus,
  Check,
  X,
  Archive,
  RotateCcw,
  Search,
  MapPin,
} from "lucide-react";
import type { Bounds, Place, PlaceSuggestion } from "../types";
import { rpc } from "../services/api";
import { db, fail } from "../services/supabase";
import { useApp, useDebounce } from "../hooks/useApp";
import { categories } from "../domain/rules";
import { MapView } from "../components/MapView";
import {
  PlaceFields,
  emptyDraft,
  draftFrom,
  draftFields,
  draftMarker,
} from "../components/PlaceFields";
import {
  PageTitle,
  AuthGate,
  Loading,
  ErrorState,
  Empty,
  Modal,
} from "../components/UI";
const fullBounds: Bounds = {
  south: -34.77,
  west: -58.57,
  north: -34.45,
  east: -58.32,
  lat: -34.6,
  lng: -58.45,
};
type Tab = "suggestions" | "catalog" | "archived" | "audit";
type Audit = {
  id: string;
  action: string;
  target_id: string;
  reason: string;
  created_at: string;
};
export default function Admin() {
  const { session, isAdmin, adminMode, setAdminMode, notice, invalidate } =
    useApp();
  const [tab, setTab] = useState<Tab>("suggestions");
  const [text, setText] = useState("");
  const search = useDebounce(text);
  const [bounds, setBounds] = useState(fullBounds);
  const [pending, setPending] = useState<Bounds | null>(null);
  const map = useRef<L.Map | null>(null);
  const onMap = useCallback((m: L.Map) => {
    map.current = m;
  }, []);
  const onBounds = useCallback((b: Bounds) => setPending(b), []);
  const [editor, setEditor] = useState<"new" | "place" | "suggestion" | null>(
    null,
  );
  const [selected, setSelected] = useState<Place | null>(null);
  const [proposal, setProposal] = useState<PlaceSuggestion | null>(null);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [reason, setReason] = useState("");
  const [duplicate, setDuplicate] = useState("");
  const [confirmation, setConfirmation] = useState<
    "reject" | "archive" | "restore" | null
  >(null);
  const permitted = isAdmin && adminMode;
  const suggestions = useInfiniteQuery({
    queryKey: ["admin-suggestions", session?.user.id],
    enabled: permitted,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: ({ pageParam }) =>
      rpc("admin_suggestions", {
        status_filter: "pending",
        before_time: pageParam?.created_at ?? null,
        before_id: pageParam?.id ?? null,
      }) as Promise<PlaceSuggestion[]>,
    getNextPageParam: (page) =>
      page.length === 100
        ? { created_at: page.at(-1)!.created_at, id: page.at(-1)!.id }
        : undefined,
  });
  const pendingRows = suggestions.data?.pages.flat() ?? [];
  const places = useQuery({
    queryKey: ["admin-catalog", bounds, search, tab, session?.user.id],
    enabled: permitted && tab !== "audit",
    queryFn: () => {
      const b = search ? fullBounds : bounds;
      return rpc("admin_catalog", {
        south: b.south,
        west: b.west,
        north: b.north,
        east: b.east,
        search,
        state: tab === "archived" ? "archived" : "active",
      }) as Promise<Place[]>;
    },
  });
  const audit = useQuery({
    queryKey: ["admin-audit", session?.user.id],
    enabled: permitted && tab === "audit",
    queryFn: async () => {
      const { data, error } = await db()
        .from("moderation_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      fail(error);
      return data as Audit[];
    },
  });
  const action = useMutation({
    mutationFn: async ({
      kind,
    }: {
      kind: "save" | "approve" | "reject" | "duplicate" | "archive" | "restore";
    }) => {
      if (reason.trim().length < 5)
        throw new Error("Explicá el motivo con al menos cinco caracteres.");
      if (kind === "save")
        return rpc("admin_save_place", {
          fields: draftFields(draft),
          reason: reason.trim(),
          pid: editor === "place" ? selected?.id : null,
        });
      if (kind === "archive" || kind === "restore")
        return rpc("admin_archive_place", {
          pid: selected?.id,
          archive: kind === "archive",
          reason: reason.trim(),
        });
      if (!proposal) throw new Error("Seleccioná una propuesta.");
      if (kind === "duplicate" && !duplicate)
        throw new Error("Elegí el local existente al que corresponde.");
      return rpc("admin_decide_suggestion", {
        sid: proposal.id,
        decision: kind,
        reason: reason.trim(),
        fields: kind === "approve" ? draftFields(draft) : null,
        existing: kind === "duplicate" ? duplicate : null,
      });
    },
    onSuccess: () => {
      setEditor(null);
      setSelected(null);
      setProposal(null);
      setConfirmation(null);
      setReason("");
      void invalidate();
      notice("Cambio guardado y registrado en la auditoría.");
    },
    onError: (e) => notice(e.message),
  });
  function selectPlace(p: Place) {
    const s = pendingRows.find((s) => s.id === p.id);
    setProposal(s ?? null);
    setSelected(s ? null : p);
    setDraft(draftFrom(s ?? p));
    setEditor(s ? "suggestion" : "place");
    setReason("");
    setDuplicate("");
    map.current?.flyTo([p.lat, p.lng], 16);
  }
  const markers =
    tab === "suggestions"
      ? pendingRows.map((s) => draftMarker(draftFrom(s), s.id)!).filter(Boolean)
      : (places.data ?? []);
  const edited = draftMarker(
    draft,
    proposal?.id ?? selected?.id ?? "draft",
    editor === "suggestion" ? "Propuesta" : "Rovia",
  );
  const mapPlaces =
    editor && edited
      ? [...markers.filter((p) => p.id !== edited.id), edited]
      : markers;
  if (!session) return <AuthGate />;
  if (!isAdmin)
    return (
      <div className="content-page">
        <Empty title="Acceso de administrador requerido">
          <p>
            Esta vista está disponible para cuentas con el permiso asignado en
            Supabase.
          </p>
          <Link className="button secondary" to="/configuracion">
            Volver a Configuración
          </Link>
        </Empty>
      </div>
    );
  if (!adminMode)
    return (
      <div className="content-page">
        <PageTitle
          eyebrow="TU CUENTA"
          title="Administración de Rovia"
          description="Podés usar tu cuenta normalmente y activar esta vista cuando necesites gestionar el catálogo."
        />
        <button className="button primary" onClick={() => setAdminMode(true)}>
          <Shield size={18} />
          Activar vista de administrador
        </button>
      </div>
    );
  return (
    <div className="content-page admin-page">
      <PageTitle
        eyebrow="OPERACIÓN DE ROVIA"
        title="Administrar locales"
        description="Revisá lugares faltantes, mantené el catálogo y consultá las acciones realizadas."
        action={
          <button
            className="button primary"
            onClick={() => {
              setEditor("new");
              setSelected(null);
              setProposal(null);
              setDraft({ ...emptyDraft });
              setReason("");
            }}
          >
            <Plus size={18} />
            Crear local
          </button>
        }
      />
      <div className="tabs">
        {(
          [
            ["suggestions", "Propuestas pendientes"],
            ["catalog", "Locales publicados"],
            ["archived", "Dados de baja"],
            ["audit", "Historial"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setEditor(null);
              setSelected(null);
              setProposal(null);
              setText("");
            }}
          >
            {label}
            {id === "suggestions" && pendingRows.length > 0
              ? ` · ${pendingRows.length}${suggestions.hasNextPage ? "+" : ""}`
              : ""}
          </button>
        ))}
      </div>
      {tab === "audit" ? (
        <section>
          {audit.isPending ? (
            <Loading />
          ) : audit.isError ? (
            <ErrorState error={audit.error} />
          ) : audit.data?.length ? (
            audit.data.map((a) => (
              <article className="moderation-card" key={a.id}>
                <strong>
                  {(
                    {
                      create_place: "Alta de local",
                      update_place: "Actualización de local",
                      archive_place: "Baja de local",
                      restore_place: "Restauración de local",
                      approve_suggestion: "Propuesta aprobada",
                      reject_suggestion: "Propuesta rechazada",
                      duplicate_suggestion: "Propuesta vinculada",
                    } as Record<string, string>
                  )[a.action] ?? a.action}
                </strong>
                <p>{a.reason}</p>
                <small>
                  {new Date(a.created_at).toLocaleString("es-AR")} ·{" "}
                  {a.target_id}
                </small>
              </article>
            ))
          ) : (
            <Empty title="Todavía no hay acciones registradas" />
          )}
        </section>
      ) : (
        <div className="admin-workspace">
          <section className="admin-map" aria-label="Mapa de administración">
            <MapView
              places={mapPlaces}
              selected={proposal?.id ?? selected?.id}
              onSelect={selectPlace}
              onBounds={onBounds}
              onMap={onMap}
              center={[-34.6, -58.46]}
              zoom={11}
              onTileError={() =>
                notice(
                  "No se pudo cargar parte del mapa. Podés seguir usando el listado.",
                )
              }
              onPick={
                editor
                  ? (lat, lng) =>
                      setDraft({
                        ...draft,
                        lat: lat.toFixed(6),
                        lng: lng.toFixed(6),
                      })
                  : undefined
              }
            />
            <div className="admin-map-tools">
              <button
                className="map-pill"
                onClick={() => map.current?.zoomIn()}
                aria-label="Acercar mapa de administración"
              >
                +
              </button>
              <button
                className="map-pill"
                onClick={() => map.current?.zoomOut()}
                aria-label="Alejar mapa de administración"
              >
                −
              </button>
              {pending && tab !== "suggestions" && (
                <button
                  className="map-pill"
                  onClick={() => {
                    setBounds(pending);
                    setPending(null);
                  }}
                >
                  Buscar en esta zona
                </button>
              )}
            </div>
            <div className="admin-map-note">
              <MapPin size={16} />
              {editor
                ? "Tocá el mapa para corregir la ubicación del local."
                : tab === "suggestions"
                  ? "Pins pendientes: todavía no aparecen en Explorar."
                  : "Seleccioná un pin o buscá un local para editarlo."}
            </div>
          </section>
          <section className="admin-panel">
            {editor ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action.mutate({
                    kind: editor === "suggestion" ? "approve" : "save",
                  });
                }}
              >
                <div className="admin-editor-heading">
                  <h2>
                    {editor === "new"
                      ? "Nuevo local"
                      : editor === "suggestion"
                        ? "Revisar propuesta"
                        : "Editar local"}
                  </h2>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Cerrar editor"
                    onClick={() => {
                      setEditor(null);
                      setSelected(null);
                      setProposal(null);
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
                {proposal?.explanation && (
                  <blockquote>{proposal.explanation}</blockquote>
                )}
                <PlaceFields
                  value={draft}
                  onChange={setDraft}
                  admin
                  requireAddress={editor === "suggestion"}
                />
                <label>
                  Motivo de la acción
                  <textarea
                    required
                    minLength={5}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Qué verificaste o por qué hacés este cambio"
                  />
                </label>
                {action.isError && <ErrorState error={action.error} />}
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={action.isPending}
                  >
                    <Check size={16} />
                    {editor === "suggestion"
                      ? "Aprobar y publicar"
                      : editor === "new"
                        ? "Dar de alta"
                        : "Guardar cambios"}
                  </button>
                  {editor === "suggestion" && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setConfirmation("reject")}
                      disabled={action.isPending}
                    >
                      Rechazar
                    </button>
                  )}
                  {editor === "place" && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        setConfirmation(
                          selected?.archived_at ? "restore" : "archive",
                        )
                      }
                      disabled={action.isPending}
                    >
                      {selected?.archived_at ? (
                        <RotateCcw size={16} />
                      ) : (
                        <Archive size={16} />
                      )}{" "}
                      {selected?.archived_at
                        ? "Restaurar local"
                        : "Dar de baja"}
                    </button>
                  )}
                </div>
                {editor === "suggestion" && (
                  <details className="duplicate-section">
                    <summary>¿El local ya está en el catálogo?</summary>
                    <p>
                      Buscalo y vinculá la propuesta al local existente para
                      evitar duplicarlo.
                    </p>
                    <label>
                      Buscar local existente
                      <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Nombre o dirección"
                      />
                    </label>
                    {places.isError && <ErrorState error={places.error} />}
                    <label>
                      Local existente
                      <select
                        value={duplicate}
                        onChange={(e) => setDuplicate(e.target.value)}
                      >
                        <option value="">Seleccioná un local</option>
                        {places.data?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.address ?? p.area}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!duplicate || action.isPending}
                      onClick={() => action.mutate({ kind: "duplicate" })}
                    >
                      Vincular al existente
                    </button>
                  </details>
                )}
              </form>
            ) : (
              <>
                <label className="search-input">
                  <Search size={18} />
                  <input
                    aria-label="Buscar en administración"
                    placeholder="Nombre o dirección del local…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                {tab === "suggestions" ? (
                  suggestions.isPending ? (
                    <Loading />
                  ) : suggestions.isError ? (
                    <ErrorState error={suggestions.error} />
                  ) : (
                    <>
                      {pendingRows
                        .filter((s) =>
                          `${s.name} ${s.address}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((s) => (
                          <button
                            className="admin-result"
                            key={s.id}
                            onClick={() =>
                              selectPlace(draftMarker(draftFrom(s), s.id)!)
                            }
                          >
                            <span className="status-chip pending">
                              En revisión
                            </span>
                            <strong>{s.name}</strong>
                            <span>
                              {categories[s.category].singular} · {s.address}
                            </span>
                          </button>
                        ))}
                      {!pendingRows.length && (
                        <Empty title="No hay propuestas pendientes">
                          <p>
                            Los lugares que sugieran los usuarios aparecerán acá
                            y en el mapa.
                          </p>
                        </Empty>
                      )}
                      {suggestions.hasNextPage && (
                        <button
                          className="button secondary"
                          disabled={suggestions.isFetchingNextPage}
                          onClick={() => void suggestions.fetchNextPage()}
                        >
                          Cargar más propuestas
                        </button>
                      )}
                    </>
                  )
                ) : places.isPending ? (
                  <Loading />
                ) : places.isError ? (
                  <ErrorState error={places.error} />
                ) : (
                  <>
                    {places.data?.map((p) => (
                      <button
                        className="admin-result"
                        key={p.id}
                        onClick={() => selectPlace(p)}
                      >
                        <strong>{p.name}</strong>
                        <span>{p.address ?? "Dirección no disponible"}</span>
                        <small>
                          {categories[p.category]?.singular ??
                            "Fuera de gastronomía"}
                          {p.closed ? " · Cerrado permanentemente" : ""}
                          {p.archived_at ? " · Dado de baja" : ""}
                        </small>
                      </button>
                    ))}
                    {places.data?.length === 300 && (
                      <p className="help">
                        Mostramos los primeros 300 resultados. Buscá por nombre
                        o acercá el mapa para encontrar otros.
                      </p>
                    )}
                    {!places.data?.length && (
                      <Empty title="No hay locales que coincidan" />
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
      <Link className="text-link" to="/moderacion">
        Revisar reportes, reseñas y correcciones
      </Link>
      {confirmation && (
        <Modal
          title={
            confirmation === "reject"
              ? "Rechazar propuesta"
              : confirmation === "archive"
                ? "Dar de baja el local"
                : "Restaurar el local"
          }
          onClose={() => setConfirmation(null)}
        >
          <p>
            {confirmation === "archive"
              ? "El local se retira de los mapas. Sus reseñas, visitas y listas se conservan y podés restaurarlo después."
              : confirmation === "reject"
                ? "La propuesta no se publica. Su autor podrá consultar el motivo."
                : "El local volverá a aparecer en el catálogo."}
          </p>
          <label>
            Motivo
            <textarea
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {action.isError && <ErrorState error={action.error} />}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={action.isPending}
              onClick={() => setConfirmation(null)}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={action.isPending || reason.trim().length < 5}
              onClick={() => action.mutate({ kind: confirmation })}
            >
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
