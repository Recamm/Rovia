import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Star } from "lucide-react";
import type { Post, Visibility } from "../types";
import { useApp } from "../hooks/useApp";
import { db, fail } from "../services/supabase";
import { placeById } from "../services/api";
import { validatePhotos } from "../domain/rules";
import { AuthGate, Loading, ErrorState } from "../components/UI";
import { PrivateImage } from "../components/ReviewCard";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export default function PostForm() {
  const { id, postId } = useParams();
  const { session, notice, invalidate } = useApp();
  const navigate = useNavigate();
  const [description, setDescription] = useState(""),
    [date, setDate] = useState(today),
    [rating, setRating] = useState(0),
    [visibility, setVisibility] = useState<Visibility>("friends"),
    [files, setFiles] = useState<File[]>([]),
    [previews, setPreviews] = useState<string[]>([]);
  const saved = useRef<string | null>(null);
  const uploaded = useRef(new Set<File>());
  const existing = useQuery({
    queryKey: ["post-edit", postId, session?.user.id],
    enabled: !!postId && !!session,
    queryFn: async () => {
      const { data, error } = await db()
        .from("posts")
        .select("*,post_photos(*)")
        .eq("id", postId!)
        .eq("user_id", session!.user.id)
        .single();
      fail(error);
      return data as Post;
    },
  });
  const placeId = id ?? existing.data?.place_id;
  const place = useQuery({
    queryKey: ["place", placeId],
    enabled: !!placeId,
    queryFn: () => placeById(placeId!),
  });
  useEffect(() => {
    if (existing.data) {
      const p = existing.data;
      setDescription(p.description);
      setDate(p.visited_on);
      setRating(p.rating ?? 0);
      setVisibility(p.visibility);
      saved.current = p.id;
    }
  }, [existing.data]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);
  const publish = useMutation({
    mutationFn: async () => {
      if (!placeId) throw new Error("Elegí un lugar.");
      const problem = validatePhotos(files);
      if (problem) throw new Error(problem);
      if (files.length + (existing.data?.post_photos?.length ?? 0) > 5)
        throw new Error("Máximo 5 fotos por publicación.");
      if (!description.trim() || description.length > 2000)
        throw new Error("Agregá una descripción de hasta 2.000 caracteres.");
      if (!date || date > today())
        throw new Error("La fecha de visita no puede estar en el futuro.");
      const fields = {
        visited_on: date,
        description: description.trim(),
        rating: rating || null,
        visibility,
      };
      if (!saved.current) {
        const { data, error } = await db()
          .from("posts")
          .insert({ ...fields, place_id: placeId })
          .select("id")
          .single();
        fail(error);
        saved.current = data!.id;
      } else {
        const { error } = await db()
          .from("posts")
          .update(fields)
          .eq("id", saved.current)
          .eq("user_id", session!.user.id);
        fail(error);
      }
      for (const file of files) {
        if (uploaded.current.has(file)) continue;
        const body = new FormData();
        body.set("mode", "post");
        body.set("post_id", saved.current!);
        body.set("file", file);
        const { data, error } = await db().functions.invoke("image-upload", {
          body,
        });
        if (error || data?.error)
          throw new Error(
            "La publicación se guardó, pero falta subir una foto. Volvé a intentar sin duplicarla.",
          );
        uploaded.current.add(file);
      }
    },
    onSuccess: () => {
      void invalidate();
      notice("Publicación guardada en tu perfil.");
      navigate("/perfil");
    },
  });
  if (!session)
    return (
      <div className="content-page">
        <AuthGate />
      </div>
    );
  if (postId && existing.isPending) return <Loading />;
  if (existing.isError) return <ErrorState error={existing.error} />;
  return (
    <div className="content-page narrow">
      <Link
        className="back-link"
        to={placeId ? `/local/${placeId}` : "/perfil"}
      >
        Volver
      </Link>
      <h1>{postId ? "Editar publicación" : "Una nueva visita"}</h1>
      <p className="muted">
        {place.data?.name} · Podés publicar cada vez que visites este lugar.
      </p>
      <form
        className="review-form"
        onSubmit={(e) => {
          e.preventDefault();
          publish.mutate();
        }}
      >
        <label>
          Fecha de la visita
          <input
            type="date"
            required
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Descripción
          <textarea
            required
            maxLength={2000}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <fieldset>
          <legend>Calificación opcional</legend>
          <div className="rating-picker">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Puntuar ${n} de 5`}
                aria-pressed={rating === n}
                onClick={() => setRating(rating === n ? 0 : n)}
              >
                <Star size={30} fill={n <= rating ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="text-link"
            onClick={() => setRating(0)}
          >
            Sin calificación
          </button>
          <p className="help">
            Este puntaje describe esta visita. La valoración general del local
            se calcula con las reseñas.
          </p>
        </fieldset>
        <label>
          Fotos opcionales · hasta 5 · JPEG, PNG o WebP · 5 MB cada una
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={publish.isPending}
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
            }}
          />
        </label>
        <div className="photo-previews">
          {previews.map((url, i) => (
            <img
              src={url}
              key={url}
              alt={`Vista previa ${i + 1}`}
              width={120}
            />
          ))}
        </div>
        <div className="review-photos">
          {existing.data?.post_photos?.map((photo) => (
            <div key={photo.id}>
              <PrivateImage
                bucket="post-photos"
                path={photo.thumbnail_path}
                alt="Foto de la publicación"
              />
              <button
                className="text-link"
                type="button"
                disabled={publish.isPending}
                onClick={async () => {
                  if (!confirm("¿Quitar esta foto?")) return;
                  const { error } = await db()
                    .from("post_photos")
                    .delete()
                    .eq("id", photo.id);
                  if (error) notice(error.message);
                  else void invalidate();
                }}
              >
                Quitar foto
              </button>
            </div>
          ))}
        </div>
        <label>
          Quién puede verla
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
          >
            <option value="friends">Amigos</option>
            <option value="public">Público</option>
            <option value="private">Solo yo</option>
          </select>
        </label>
        <p className="help">
          La privacidad de tu perfil también limita quién puede ver la
          publicación.
        </p>
        {publish.isError && <ErrorState error={publish.error} />}
        <button
          className="button primary"
          disabled={publish.isPending || !placeId}
        >
          {publish.isPending ? "Guardando…" : "Guardar publicación"}
        </button>
      </form>
    </div>
  );
}
