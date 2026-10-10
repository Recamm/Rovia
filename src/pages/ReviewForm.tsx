import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Star, ImagePlus, X } from "lucide-react";
import type { Visibility } from "../types";
import { placeById, reviewsFor, saveReview, rpc } from "../services/api";
import { validateReview, validatePhotos } from "../domain/rules";
import { useApp } from "../hooks/useApp";
import { db, fail } from "../services/supabase";
import { AuthGate, Loading, ErrorState } from "../components/UI";
import { PrivateImage } from "../components/ReviewCard";
export default function ReviewForm() {
  const { id = "" } = useParams();
  const { session, notice, invalidate } = useApp();
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("friends");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [visited, setVisited] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [uploadedNames, setUploadedNames] = useState<string[]>([]);
  const place = useQuery({
    queryKey: ["place", id],
    queryFn: () => placeById(id),
  });
  const reviews = useQuery({
    queryKey: ["reviews", id, session?.user.id],
    queryFn: () => reviewsFor(id),
    enabled: !!session,
  });
  const existing = reviews.data?.find((r) => r.user_id === session?.user.id);
  useEffect(() => {
    if (existing) {
      setRating(existing.rating);
      setComment(existing.comment);
      setVisibility(existing.visibility);
      setSavedId(existing.id);
    }
  }, [existing?.id]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);
  const publish = useMutation({
    mutationFn: async () => {
      const problem = validateReview(rating, comment) || validatePhotos(files);
      if (problem) throw new Error(problem);
      const r = await saveReview(
        id,
        rating,
        comment,
        visibility,
        savedId ?? existing?.id,
      );
      setSavedId(r.id);
      for (const file of files) {
        const name = `${file.name}:${file.size}:${file.lastModified}`;
        if (uploadedNames.includes(name)) continue;
        const body = new FormData();
        body.set("review_id", r.id);
        body.set("file", file);
        const { error: uploadError } = await db().functions.invoke(
          "image-upload",
          { body },
        );
        if (uploadError)
          throw new Error(
            "La reseña se guardó, pero falta subir una foto. Podés volver a intentar sin duplicar tu reseña.",
          );
        setUploadedNames((n) => [...n, name]);
      }
      if (visited)
        await rpc("mark_visit", {
          pid: id,
          audience: visibility,
          share: false,
          clear_pending: true,
        });
      return r;
    },
    onSuccess: () => {
      void invalidate();
      notice(
        visited
          ? "Experiencia guardada y lugar marcado como visitado."
          : "Experiencia guardada. No agregamos una visita adicional.",
      );
      navigate(`/local/${id}`);
    },
    onError: (e) => setError(e.message),
  });
  if (!session)
    return (
      <div className="content-page">
        <AuthGate />
      </div>
    );
  return (
    <div className="content-page narrow">
      <Link className="back-link" to={`/local/${id}`}>
        <ArrowLeft size={17} />
        Volver al lugar
      </Link>
      <span className="eyebrow">TU EXPERIENCIA</span>
      <h1>
        {existing ? "Editar tu reseña" : "Cada lugar tiene una historia"}
        <span className="coral">.</span>
      </h1>
      {place.isPending ? (
        <Loading />
      ) : (
        <p className="muted">{place.data?.name}</p>
      )}
      <form
        className="review-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          publish.mutate();
        }}
      >
        <fieldset>
          <legend>¿Cómo fue tu experiencia?</legend>
          <div className="rating-picker">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                aria-label={`Puntuar ${n} de 5`}
                aria-pressed={rating === n}
                onClick={() => setRating(n)}
              >
                <Star size={36} fill={n <= rating ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Contanos un poco
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={6}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="¿Qué te gustó? ¿Qué le contarías a alguien que quiere ir?"
          />
          <span className="help">
            {comment.length}/2.000 caracteres · mínimo 10
          </span>
        </label>
        <label className="upload-label">
          <ImagePlus size={22} />
          Agregá fotos de tu experiencia
          <span>
            Opcional · hasta 5 fotos · JPEG, PNG o WebP · 5 MB por foto
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => {
              const next = Array.from(e.target.files ?? []);
              const problem = validatePhotos(next);
              if (problem) {
                setError(problem);
                return;
              }
              if (next.length + (existing?.review_photos?.length ?? 0) > 5) {
                setError("La reseña admite un máximo total de cinco fotos.");
                return;
              }
              setFiles(next);
              setUploadedNames([]);
            }}
          />
        </label>
        <div className="photo-previews">
          {existing?.review_photos?.map((p) => (
            <div key={p.id}>
              <PrivateImage path={p.thumbnail_path} alt="Foto de tu reseña" />
              <button
                type="button"
                aria-label="Eliminar foto"
                onClick={async () => {
                  if (!confirm("¿Eliminar esta foto?")) return;
                  const { error: e } = await db().functions.invoke(
                    "image-upload",
                    { body: { action: "remove", photo_id: p.id } },
                  );
                  if (e) setError("No pudimos eliminar la foto.");
                  else void invalidate();
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          {previews.map((p, i) => (
            <div key={p}>
              <img src={p} alt={`Vista previa ${i + 1}`} />
              <button
                type="button"
                aria-label={`Quitar foto ${i + 1}`}
                onClick={() => setFiles((f) => f.filter((_, n) => n !== i))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <label>
          Quién puede ver esta reseña
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
          >
            <option value="friends">Mis amigos</option>
            <option value="public">Pública</option>
            <option value="private">Solo yo</option>
          </select>
          <span className="help">
            La privacidad de tu perfil puede limitar aún más esta audiencia.
            Seguirte no concede acceso para amigos.
          </span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={visited}
            onChange={(e) => setVisited(e.target.checked)}
          />
          También marcar “Ya fui” y quitar “Quiero ir”
        </label>
        <p className="help">
          No compartimos una visita adicional en el feed. Las fotos se
          reprocesan para retirar metadatos.
        </p>
        {error && <ErrorState error={new Error(error)} />}
        <button
          className="button primary wide"
          disabled={publish.isPending || reviews.isPending}
        >
          {publish.isPending
            ? "Guardando tu experiencia…"
            : existing
              ? "Guardar cambios"
              : "Publicar reseña"}
        </button>
      </form>
    </div>
  );
}
