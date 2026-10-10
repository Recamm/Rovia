import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Heart, Flag, Lock, Globe, Users, Trash2, Pencil } from "lucide-react";
import type { Review } from "../types";
import { visibilityLabels } from "../domain/rules";
import { useApp } from "../hooks/useApp";
import { toggle, signedPhoto, deleteRow } from "../services/api";
import { db, fail } from "../services/supabase";
import { Modal, ErrorState, PlaceLink } from "./UI";
export function PrivateImage({
  path,
  alt,
  bucket = "review-photos",
}: {
  path: string;
  alt: string;
  bucket?: string;
}) {
  const { session } = useApp();
  const image = useQuery({
    queryKey: ["photo", path, bucket, session?.user.id],
    queryFn: () => signedPhoto(path, bucket),
    staleTime: 30000,
    refetchInterval: 45000,
    retry: false,
  });
  return image.data && !image.isError ? (
    <img className="review-photo" src={image.data} alt={alt} loading="lazy" />
  ) : (
    <span className="photo-loading">
      {image.isError ? "Foto no disponible" : "Cargando foto…"}
    </span>
  );
}
export default function ReviewCard({
  review,
  withPlace = false,
}: {
  review: Review;
  withPlace?: boolean;
}) {
  const { session, requireAuth, notice, invalidate } = useApp();
  const [report, setReport] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [reason, setReason] = useState("spam");
  const [explanation, setExplanation] = useState("");
  const liked =
    review.likes?.some((l) => l.user_id === session?.user.id) ?? false;
  const mutation = useMutation({
    mutationFn: () =>
      toggle("likes", "review_id", review.id, liked, session!.user.id),
    onSuccess: invalidate,
    onError: (e) => notice(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteRow("reviews", "id", review.id),
    onSuccess: () => {
      notice(
        "Reseña eliminada. Sus fotos se retiraron y se programó su limpieza.",
      );
      void invalidate();
    },
    onError: (e) => notice(e.message),
  });
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await db()
        .from("reports")
        .insert({
          review_id: photoId ? null : review.id,
          photo_id: photoId,
          reason,
          explanation,
        });
      fail(error);
    },
    onSuccess: () => {
      setReport(false);
      notice("Reporte enviado para revisión.");
    },
    onError: (e) => notice(e.message),
  });
  const own = review.user_id === session?.user.id;
  const VisibilityIcon =
    review.visibility === "public"
      ? Globe
      : review.visibility === "friends"
        ? Users
        : Lock;
  return (
    <article className="review-card">
      <div className="review-header">
        <Link to={`/persona/${review.user_id}`} className="avatar">
          {review.profiles?.display_name.slice(0, 1) || "R"}
        </Link>
        <div>
          <Link to={`/persona/${review.user_id}`}>
            <strong>{review.profiles?.display_name || "Tu reseña"}</strong>
          </Link>
          <span>
            {new Date(review.created_at).toLocaleDateString("es-AR", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <span className="visibility-tag">
          <VisibilityIcon size={13} />
          {visibilityLabels[review.visibility]}
        </span>
      </div>
      {withPlace && (
        <PlaceLink
          id={review.place_id}
          name={review.places?.name || "Ver lugar"}
        />
      )}
      <div className="stars" aria-label={`${review.rating} de 5 estrellas`}>
        {"★".repeat(review.rating)}
        <span>{"★".repeat(5 - review.rating)}</span>
      </div>
      <p className="review-comment">{review.comment}</p>
      {review.hidden && <p className="error">Reseña oculta por moderación.</p>}
      <div className="review-photos">
        {review.review_photos?.map((photo, i) => (
          <div key={photo.id}>
            <PrivateImage
              path={photo.thumbnail_path}
              alt={`Foto ${i + 1} de la experiencia`}
            />
            <button
              className="text-link"
              onClick={() => {
                if (requireAuth()) {
                  setPhotoId(photo.id);
                  setReport(true);
                  setExplanation("");
                }
              }}
            >
              Reportar foto
            </button>
          </div>
        ))}
      </div>
      <div className="review-actions">
        <button
          className={`text-button ${liked ? "liked" : ""}`}
          disabled={mutation.isPending || review.archived}
          onClick={() => {
            if (requireAuth()) mutation.mutate();
          }}
          aria-pressed={liked}
        >
          <Heart size={17} fill={liked ? "currentColor" : "none"} />
          {review.likes?.length ?? 0} Me gusta
        </button>
        {own ? (
          <>
            {!review.archived && (
              <Link
                className="text-button"
                to={`/local/${review.place_id}/resena`}
              >
                <Pencil size={15} />
                Editar
              </Link>
            )}
            <button
              className="text-button"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm("¿Eliminar esta reseña y sus fotos?"))
                  remove.mutate();
              }}
            >
              <Trash2 size={15} />
              Eliminar
            </button>
          </>
        ) : (
          <button
            className="text-button"
            onClick={() => {
              if (requireAuth()) {
                setPhotoId(null);
                setReport(true);
              }
            }}
          >
            <Flag size={15} />
            Reportar
          </button>
        )}
      </div>
      {report && (
        <Modal title="Reportar experiencia" onClose={() => setReport(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <label>
              Motivo
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="spam">Spam</option>
                <option value="inappropriate">Contenido inapropiado</option>
                <option value="misleading">Información engañosa</option>
              </select>
            </label>
            <label>
              Explicación opcional
              <textarea
                maxLength={1000}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            </label>
            {send.isError && <ErrorState error={send.error} />}
            <button className="button primary" disabled={send.isPending}>
              Enviar reporte
            </button>
          </form>
        </Modal>
      )}
    </article>
  );
}
