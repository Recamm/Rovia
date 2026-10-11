import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapPin, CheckCircle2 } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import { db, fail } from "../services/supabase";
import {
  locateAddress,
  hasStreetNumber,
  type AddressLocation,
} from "../services/geocoding";
import type { PlaceSuggestion } from "../types";
import { PageTitle, AuthGate, ErrorState, Loading } from "../components/UI";
import {
  PlaceFields,
  LocationPicker,
  emptyDraft,
  draftFields,
  type PlaceDraft,
} from "../components/PlaceFields";
export default function SuggestPlace() {
  const { session, notice, invalidate } = useApp();
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [explanation, setExplanation] = useState("");
  const [sent, setSent] = useState(false);
  const [addressReady, setAddressReady] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const address = draft.address.trim();
  const location = useQuery({
    queryKey: ["suggest-address", address],
    queryFn: ({ signal }) => locateAddress(address, signal),
    enabled: !!session && addressReady && hasStreetNumber(address),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  function chooseLocation(result: AddressLocation) {
    setConfirmed(false);
    setDraft((d) => ({
      ...d,
      lat: String(result.lat),
      lng: String(result.lng),
    }));
  }
  useEffect(() => {
    if (addressReady && location.data?.length && !draft.lat)
      chooseLocation(location.data[0]);
  }, [addressReady, location.data, draft.lat]);
  function changeDraft(next: PlaceDraft) {
    if (next.address !== draft.address) {
      setAddressReady(false);
      setConfirmed(false);
      next = { ...next, lat: "", lng: "" };
    }
    if (next.lat !== draft.lat || next.lng !== draft.lng) setConfirmed(false);
    setDraft(next);
  }
  const own = useQuery({
    queryKey: ["suggestions", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await db()
        .from("place_suggestions")
        .select("*")
        .eq("user_id", session!.user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      fail(error);
      return data as PlaceSuggestion[];
    },
  });
  const submit = useMutation({
    mutationFn: () => {
      if (!confirmed || !hasStreetNumber(address))
        throw new Error(
          "Ingresá calle y número y confirmá la ubicación en el mapa.",
        );
      return rpc("submit_place_suggestion", {
        fields: draftFields(draft),
        explanation: explanation.trim(),
      });
    },
    onSuccess: () => {
      setSent(true);
      setDraft({ ...emptyDraft });
      setExplanation("");
      setAddressReady(false);
      setConfirmed(false);
      void invalidate();
      notice(
        "Propuesta enviada. Un administrador revisará el local antes de publicarlo.",
      );
    },
  });
  return (
    <div className="content-page suggestion-page">
      <PageTitle
        eyebrow="UN MAPA QUE CRECE CON VOS"
        title="Sugerí un local"
        description="Completá sus datos, confirmá la ubicación y enviá tu propuesta."
      />
      {!session ? (
        <AuthGate />
      ) : (
        <>
          <div className="privacy-callout">
            <MapPin size={22} />
            <p>
              Incluimos gastronomía y bares de CABA y todo Vicente López. Tu
              propuesta queda pendiente de revisión y no aparece en el mapa
              público hasta que se apruebe.
            </p>
          </div>
          {sent && (
            <div className="success-callout" role="status">
              <CheckCircle2 size={22} />
              <span>
                Tu propuesta ya está en revisión. Podés seguir explorando o
                sugerir otro local.
              </span>
              <Link to="/">Volver al mapa</Link>
            </div>
          )}
          <form
            className="suggestion-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(false);
              submit.mutate();
            }}
          >
            <div>
              <PlaceFields
                value={draft}
                onChange={changeDraft}
                requireAddress
                simple
                onAddressBlur={() => setAddressReady(true)}
              />
              <p className="help">
                Escribí calle y número. Si hace falta, agregá la localidad.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setAddressReady(true);
                  if (addressReady && hasStreetNumber(address))
                    void location.refetch();
                }}
                disabled={!hasStreetNumber(address) || location.isFetching}
              >
                <MapPin size={16} />{" "}
                {location.isFetching
                  ? "Ubicando dirección…"
                  : "Ubicar dirección"}
              </button>
              {addressReady && !hasStreetNumber(address) && (
                <p className="error" role="alert">
                  Ingresá la calle y el número del local.
                </p>
              )}
              <label>
                Información o descripción · opcional
                <textarea
                  maxLength={1000}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Contanos algo del local, si querés"
                />
              </label>
            </div>
            <div className="suggestion-location">
              <h2>Confirmá la ubicación</h2>
              <p className="help" role="status">
                {location.isFetching
                  ? "Buscando la dirección…"
                  : "Revisá el pin. Podés corregirlo tocando el mapa."}
              </p>
              {addressReady && location.isError && (
                <ErrorState error={location.error} />
              )}
              {addressReady && location.data && location.data.length > 1 && (
                <label>
                  Encontramos varias direcciones
                  <select
                    value={location.data.findIndex(
                      (p) =>
                        String(p.lat) === draft.lat &&
                        String(p.lng) === draft.lng,
                    )}
                    onChange={(e) =>
                      chooseLocation(location.data![Number(e.target.value)])
                    }
                  >
                    <option value="-1" disabled>
                      Elegí una dirección
                    </option>
                    {location.data.map((p, i) => (
                      <option key={p.label} value={i}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <LocationPicker value={draft} onChange={changeDraft} />
              <p className="help">
                Direcciones:{" "}
                <a
                  href="https://www.argentina.gob.ar/georef"
                  target="_blank"
                  rel="noreferrer"
                >
                  GeoRef Argentina
                </a>
                . La ubicación es aproximada: confirmala antes de enviar.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  disabled={
                    !draft.lat || !draft.lng || !hasStreetNumber(address)
                  }
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Sí, el local está en la ubicación marcada
              </label>
              {submit.isError && <ErrorState error={submit.error} />}
              <button
                className="button primary"
                disabled={submit.isPending || !confirmed}
              >
                {submit.isPending ? "Enviando…" : "Enviar propuesta"}
              </button>
            </div>
          </form>
          <section className="suggestions-history">
            <h2>Mis propuestas</h2>
            {own.isPending ? (
              <Loading />
            ) : own.isError ? (
              <ErrorState error={own.error} />
            ) : own.data?.length ? (
              own.data.map((s) => (
                <article className="moderation-card" key={s.id}>
                  <h3>{s.name}</h3>
                  <p>{s.address}</p>
                  <span className={`status-chip ${s.status}`}>
                    {s.status === "pending"
                      ? "En revisión"
                      : s.status === "approved"
                        ? "Publicada o vinculada a un local existente"
                        : "No aprobada"}
                  </span>
                  {s.decision_reason && <p>{s.decision_reason}</p>}
                  {s.place_id && (
                    <Link className="text-link" to={`/local/${s.place_id}`}>
                      Ver local
                    </Link>
                  )}
                </article>
              ))
            ) : (
              <p className="muted">
                Acá vas a poder consultar el estado de tus propuestas.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
