import { Link } from "react-router-dom";
import { Heart, Pencil, Trash2, EyeOff } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import type { Post } from "../types";
import { useApp } from "../hooks/useApp";
import { db, fail } from "../services/supabase";
import { PrivateImage } from "./ReviewCard";
import { visibilityLabels } from "../domain/rules";
export default function PostCard({ post }: { post: Post }) {
  const { session, notice, invalidate, requireAuth, isAdmin } = useApp();
  const liked =
    post.post_likes?.some((l) => l.user_id === session?.user.id) ?? false;
  const action = useMutation({
    mutationFn: async (kind: "like" | "delete" | "hide") => {
      if (kind === "hide") {
        const { data, error } = await db().functions.invoke("admin-users", {
          body: { action: "hide_post", post_id: post.id, hidden: !post.hidden },
        });
        fail(error);
        if (data?.error) throw new Error(data.error);
      } else if (kind === "delete") {
        const { error } = await db().from("posts").delete().eq("id", post.id);
        fail(error);
      } else {
        const query = liked
          ? db()
              .from("post_likes")
              .delete()
              .eq("post_id", post.id)
              .eq("user_id", session!.user.id)
          : db().from("post_likes").insert({ post_id: post.id });
        const { error } = await query;
        fail(error);
      }
    },
    onSuccess: invalidate,
    onError: (e) => notice(e.message),
  });
  return (
    <article className="review-card post-card">
      <div className="review-header">
        <div>
          <Link to={`/persona/${post.user_id}`}>
            <strong>{post.profiles?.display_name ?? "Tu publicación"}</strong>
          </Link>
          <span>{visibilityLabels[post.visibility]}</span>
        </div>
        <span className="visibility-tag">Publicación</span>
      </div>
      <Link className="text-link" to={`/local/${post.place_id}`}>
        {post.places?.name ?? "Ver lugar"}
      </Link>
      <p className="post-date">
        Visita del{" "}
        {new Date(`${post.visited_on}T12:00:00`).toLocaleDateString("es-AR")}
      </p>
      {post.rating && (
        <div className="stars" aria-label={`${post.rating} de 5 estrellas`}>
          {"★".repeat(post.rating)}
          <span>{"★".repeat(5 - post.rating)}</span>
        </div>
      )}
      <p className="review-comment">{post.description}</p>
      {post.hidden && (
        <p className="error">Publicación oculta por administración.</p>
      )}
      <div className="post-photos">
        {post.post_photos?.map((p, i) => (
          <PrivateImage
            key={p.id}
            bucket="post-photos"
            path={p.path}
            alt={`Foto ${i + 1} de la visita`}
          />
        ))}
      </div>
      <div className="review-actions">
        <button
          className={`text-button ${liked ? "liked" : ""}`}
          disabled={action.isPending}
          aria-pressed={liked}
          onClick={() => {
            if (requireAuth()) action.mutate("like");
          }}
        >
          <Heart size={17} />
          {post.post_likes?.length ?? 0} Me gusta
        </button>
        {post.user_id === session?.user.id && (
          <>
            <Link className="text-button" to={`/publicacion/${post.id}/editar`}>
              <Pencil size={16} />
              Editar
            </Link>
            <button
              className="text-button"
              disabled={action.isPending}
              onClick={() => {
                if (confirm("¿Eliminar esta publicación y sus fotos?"))
                  action.mutate("delete");
              }}
            >
              <Trash2 size={16} />
              Eliminar
            </button>
          </>
        )}
        {isAdmin && (
          <button
            className="text-button"
            disabled={action.isPending}
            onClick={() => action.mutate("hide")}
          >
            <EyeOff size={16} />
            {post.hidden ? "Restaurar" : "Ocultar"}
          </button>
        )}
      </div>
    </article>
  );
}
