import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapPin, CheckCircle2 } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import { db, fail } from "../services/supabase";
import type { PlaceSuggestion } from "../types";
import { PageTitle, AuthGate, ErrorState, Loading } from "../components/UI";
import {
  PlaceFields,
  LocationPicker,
  emptyDraft,
  draftFields,
} from "../components/PlaceFields";
export default function SuggestPlace() {
  const { session, notice, invalidate } = useApp();
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [explanation, setExplanation] = useState("");
  const [sent, setSent] = useState(false);
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
    mutationFn: () =>
      rpc("submit_place_suggestion", {
        fields: draftFields(draft),
        explanation: explanation.trim(),
      }),
    onSuccess: () => {
      setSent(true);
      setDraft({ ...emptyDraft });
      setExplanation("");
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
        description="¿Falta un lugar para comer o tomar algo? Ubicalo en el mapa y ayudanos a completar el catálogo."
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
              <LocationPicker value={draft} onChange={setDraft} />
            </div>
            <div>
              <PlaceFields value={draft} onChange={setDraft} requireAddress />
              <label>
                Información para la revisión · opcional
                <textarea
                  maxLength={1000}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Ej.: abrió hace poco, enlace del local o referencia de su ubicación"
                />
              </label>
              {submit.isError && <ErrorState error={submit.error} />}
              <button className="button primary" disabled={submit.isPending}>
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
