import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Shield, Check, X, EyeOff, Eye } from "lucide-react";
import { rpc } from "../services/api";
import { useApp } from "../hooks/useApp";
import { PrivateImage } from "../components/ReviewCard";
import {
  PageTitle,
  Loading,
  ErrorState,
  Empty,
  AuthGate,
} from "../components/UI";
type QueueItem = {
  id: string;
  place_id?: string;
  review_id?: string;
  photo_id?: string;
  fields?: Record<string, unknown>;
  explanation: string;
  reason?: string;
  comment?: string;
  hidden?: boolean;
  thumbnail_path?: string;
  status: string;
};
export default function Moderation() {
  const { session, notice, invalidate } = useApp();
  const [reason, setReason] = useState("");
  const role = useQuery({
    queryKey: ["moderator", session?.user.id],
    enabled: !!session,
    queryFn: () => rpc("is_moderator", {}) as Promise<boolean>,
  });
  const queue = useQuery({
    queryKey: ["moderation", session?.user.id],
    enabled: role.data === true,
    queryFn: () =>
      rpc("moderation_queue", {}) as Promise<{
        corrections: QueueItem[];
        reports: QueueItem[];
        hidden: QueueItem[];
        hidden_photos: QueueItem[];
      }>,
  });
  const mutation = useMutation({
    mutationFn: async ({
      target,
      action,
    }: {
      target: string;
      action: string;
    }) => {
      if (reason.trim().length < 5)
        throw new Error("Registrá un motivo de al menos cinco caracteres.");
      await rpc("moderate", { target, action, reason: reason.trim() });
    },
    onSuccess: () => {
      void invalidate();
      notice("Acción registrada en la auditoría.");
    },
    onError: (e) => notice(e.message),
  });
  if (!session) return <AuthGate />;
  if (role.isPending) return <Loading />;
  if (role.isError) return <ErrorState error={role.error} />;
  if (!role.data)
    return (
      <Empty title="Acceso restringido">
        <p>
          Esta pantalla requiere un rol de moderador asignado desde un entorno
          confiable.
        </p>
      </Empty>
    );
  return (
    <div className="content-page">
      <PageTitle
        eyebrow="OPERACIÓN DE ROVIA"
        title="Moderación"
        description="Revisá propuestas y reportes. Todas las acciones registran autor, fecha y motivo."
      />
      <label>
        Motivo de la acción
        <input
          value={reason}
          minLength={5}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explicá por qué aprobás, rechazás u ocultás"
        />
      </label>
      {queue.isPending ? (
        <Loading />
      ) : queue.isError ? (
        <ErrorState error={queue.error} />
      ) : (
        <>
          <h2>Correcciones pendientes</h2>
          {queue.data?.corrections.length ? (
            queue.data.corrections.map((c) => (
              <article className="moderation-card" key={c.id}>
                <h3>Local: {c.place_id}</h3>
                <pre>{JSON.stringify(c.fields, null, 2)}</pre>
                <p>{c.explanation}</p>
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        target: c.id,
                        action: "approve_correction",
                      })
                    }
                  >
                    <Check size={16} />
                    Aprobar{c.fields?.duplicate_of ? " y fusionar" : ""}
                  </button>
                  <button
                    className="button secondary"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        target: c.id,
                        action: "reject_correction",
                      })
                    }
                  >
                    <X size={16} />
                    Rechazar
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">No hay correcciones pendientes.</p>
          )}
          <h2>Reportes pendientes</h2>
          {queue.data?.reports.length ? (
            queue.data.reports.map((r) => (
              <article className="moderation-card" key={r.id}>
                <strong>{r.reason}</strong>
                <p>{r.explanation}</p>
                <p>{r.comment}</p>
                {r.thumbnail_path && (
                  <PrivateImage path={r.thumbnail_path} alt="Foto reportada" />
                )}
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({ target: r.id, action: "hide_reported" })
                    }
                  >
                    <EyeOff size={16} />
                    Ocultar contenido
                  </button>
                  <button
                    className="button secondary"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({ target: r.id, action: "reject_report" })
                    }
                  >
                    Rechazar reporte
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">No hay reportes pendientes.</p>
          )}
          <h2>Reseñas ocultas</h2>
          {queue.data?.hidden.map((r) => (
            <article className="moderation-card" key={r.id}>
              <p>{r.comment}</p>
              <button
                className="button secondary"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ target: r.id, action: "restore_review" })
                }
              >
                <Eye size={16} />
                Restaurar
              </button>
            </article>
          ))}
          <h2>Fotos ocultas</h2>
          {queue.data?.hidden_photos.map((ph) => (
            <article className="moderation-card" key={ph.id}>
              {ph.thumbnail_path && (
                <PrivateImage
                  path={ph.thumbnail_path}
                  alt="Foto oculta para revisión"
                />
              )}
              <button
                className="button secondary"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ target: ph.id, action: "restore_photo" })
                }
              >
                Restaurar foto
              </button>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
