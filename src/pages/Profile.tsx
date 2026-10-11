import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Settings, Lock, MapPin, Users, ArrowRight } from "lucide-react";
import type { Review, Place, RoviaList, Post } from "../types";
import { publicProfile, withRatings } from "../services/api";
import { db, configured, fail } from "../services/supabase";
import { useApp } from "../hooks/useApp";
import {
  AuthGate,
  Loading,
  ErrorState,
  Empty,
  PlaceCard,
} from "../components/UI";
import { PersonCard } from "./People";
import PostCard from "../components/PostCard";
import ReviewCard, { PrivateImage } from "../components/ReviewCard";
export default function Profile() {
  const { id: other } = useParams();
  const { session } = useApp();
  const navigate = useNavigate();
  const id = other ?? session?.user.id;
  const own = id === session?.user.id;
  const profile = useQuery({
    queryKey: ["profile", id, session?.user.id],
    enabled: !!id && configured,
    queryFn: () => publicProfile(id!),
    refetchInterval: 30000,
  });
  const activity = useQuery({
    queryKey: ["profile-activity", id, session?.user.id],
    enabled: !!id && !!profile.data?.accessible,
    refetchInterval: 30000,
    queryFn: async () => {
      const [reviews, visits, lists, archived] = await Promise.all([
        db()
          .from("reviews")
          .select(
            "*,profiles!reviews_user_id_fkey(id,username,display_name),places(id,name,category),review_photos(id,path,thumbnail_path),likes(user_id)",
          )
          .eq("user_id", id!)
          .eq("archived", false)
          .order("created_at", { ascending: false })
          .limit(30),
        db().from("visits").select("places(*)").eq("user_id", id!).limit(50),
        db()
          .from("lists")
          .select("*,list_places(place_id)")
          .eq("owner_id", id!)
          .limit(50),
        db()
          .from("reviews")
          .select(
            "*,profiles!reviews_user_id_fkey(id,username,display_name),places(id,name,category),review_photos(id,path,thumbnail_path),likes(user_id)",
          )
          .eq("user_id", id!)
          .eq("archived", true)
          .order("updated_at", { ascending: false })
          .limit(30),
      ]);
      [reviews, visits, lists, archived].forEach((r) => fail(r.error));
      const visitRows = visits.data as unknown as { places: Place }[];
      const rated = await withRatings(visitRows.map((v) => v.places));
      return {
        reviews: reviews.data as Review[],
        archived: archived.data as Review[],
        visits: visitRows.map((v, i) => ({ ...v, places: rated[i] })),
        lists: lists.data as RoviaList[],
      };
    },
  });
  const posts = useQuery({
    queryKey: ["profile-posts", id, session?.user.id],
    enabled: !!id && !!profile.data?.accessible,
    queryFn: async () => {
      const { data, error } = await db()
        .from("posts")
        .select(
          "*,profiles!posts_user_id_fkey(id,username,display_name),places!posts_place_id_fkey(id,name,category),post_photos(id,path,thumbnail_path),post_likes(user_id)",
        )
        .eq("user_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      fail(error);
      return data as Post[];
    },
  });
  if (!id)
    return (
      <div className="content-page">
        <AuthGate />
      </div>
    );
  if (!configured)
    return (
      <div className="content-page">
        <Empty title="Perfil pendiente de conexión">
          <p>Conectá Supabase para acceder a perfiles reales.</p>
        </Empty>
      </div>
    );
  if (profile.isPending) return <Loading />;
  if (profile.isError) return <ErrorState error={profile.error} />;
  const p = profile.data;
  if (!p) return <Empty title="No encontramos este perfil" />;
  return (
    <div className="content-page profile-page">
      <div className="profile-cover">
        <span>Tus lugares, tus historias.</span>
        <MapPin size={46} />
      </div>
      <div className="profile-heading">
        <span className="avatar jumbo">
          {p.avatar_path ? (
            <PrivateImage
              bucket="avatars"
              path={p.avatar_path}
              alt={`Avatar de ${p.display_name}`}
            />
          ) : (
            p.display_name.slice(0, 1)
          )}
        </span>
        <div>
          <h1>{p.display_name}</h1>
          <p>@{p.username}</p>
        </div>
        {own && (
          <Link className="button secondary" to="/configuracion">
            <Settings size={17} />
            Editar perfil
          </Link>
        )}
      </div>
      {!own && <PersonCard profile={p} />}{" "}
      {p.accessible ? (
        <>
          <p className="profile-bio">
            {p.bio || "Un nuevo lugar, una nueva historia."}
          </p>
          <div className="profile-counts">
            <Link
              to={
                own
                  ? "/personas?tab=friends"
                  : `/persona/${id}/conexiones?tab=friends`
              }
            >
              <strong>{p.friends ?? 0}</strong> amigos
            </Link>
            <Link
              to={
                own
                  ? "/personas?tab=followers"
                  : `/persona/${id}/conexiones?tab=followers`
              }
            >
              <strong>{p.followers ?? 0}</strong> seguidores
            </Link>
            <Link
              to={
                own
                  ? "/personas?tab=following"
                  : `/persona/${id}/conexiones?tab=following`
              }
            >
              <strong>{p.following ?? 0}</strong> seguidos
            </Link>
          </div>
          <h2>{own ? "Mis publicaciones" : "Publicaciones"}</h2>
          {own && (
            <Link className="button secondary" to="/">
              Elegir un lugar para publicar
            </Link>
          )}
          {posts.isPending ? (
            <Loading />
          ) : posts.isError ? (
            <ErrorState error={posts.error} />
          ) : posts.data?.length ? (
            posts.data.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <Empty title="Todavía no hay publicaciones" />
          )}
          <h2>{own ? "Mis reseñas" : "Sus reseñas"}</h2>
          {activity.isPending ? (
            <Loading />
          ) : activity.isError ? (
            <ErrorState error={activity.error} />
          ) : activity.data?.reviews.length ? (
            activity.data.reviews.map((r) => (
              <ReviewCard key={r.id} review={r} withPlace />
            ))
          ) : (
            <Empty title="Todavía no hay experiencias para mostrar" />
          )}
          {own && !!activity.data?.archived.length && (
            <>
              <h2>Historial de reseñas archivadas</h2>
              <p className="help">
                Conservamos estas experiencias al resolver locales duplicados.
                Tu otra reseña sigue activa.
              </p>
              {activity.data.archived.map((r) => (
                <ReviewCard key={r.id} review={r} withPlace />
              ))}
            </>
          )}
          <h2>Lugares visitados</h2>
          <div className="saved-grid">
            {activity.data?.visits.map((v) => (
              <PlaceCard
                key={v.places.id}
                place={v.places}
                onSelect={(p) => navigate(`/local/${p.id}`)}
              />
            ))}
          </div>
          {activity.data?.visits.length === 0 && (
            <p className="muted">No hay visitas accesibles.</p>
          )}
          <h2>Listas</h2>
          <div className="profile-lists">
            {activity.data?.lists.map((l) => (
              <Link className="list-select" to={`/lista/${l.id}`} key={l.id}>
                {l.name}
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="privacy-callout">
          <Lock size={23} />
          <div>
            <h3>Su actividad está restringida</h3>
            <p>
              Seguir a esta persona no habilita contenido para amigos. La
              solicitud requiere aceptación.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
