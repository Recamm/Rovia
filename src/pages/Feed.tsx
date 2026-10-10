import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Check, ArrowRight } from "lucide-react";
import type { Review } from "../types";
import { rpc } from "../services/api";
import { useApp } from "../hooks/useApp";
import {
  AuthGate,
  PageTitle,
  Loading,
  ErrorState,
  Empty,
  PlaceLink,
} from "../components/UI";
import ReviewCard from "../components/ReviewCard";
type Entry = Review & {
  entry_type: "review" | "visit";
  visited_on: string | null;
};
type Cursor = { time: string; id: string } | null;
export default function Feed() {
  const [mode, setMode] = useState("all");
  const { session } = useApp();
  const feed = useInfiniteQuery({
    queryKey: ["feed", mode, session?.user.id],
    enabled: !!session,
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }) =>
      (await rpc("activity_feed", {
        mode,
        before_time: pageParam?.time ?? null,
        before_id: pageParam?.id ?? null,
      })) as Entry[],
    getNextPageParam: (last) =>
      last.length === 20
        ? {
            time: last[last.length - 1].created_at,
            id: last[last.length - 1].id,
          }
        : undefined,
    refetchInterval: 30000,
  });
  return (
    <div className="content-page feed-page">
      <PageTitle
        eyebrow="HISTORIAS QUE TE ACERCAN"
        title="Lo que anda pasando"
        description="Experiencias y descubrimientos de las personas con las que conectás."
      />
      {!session ? (
        <AuthGate />
      ) : (
        <>
          <div className="tabs">
            {[
              ["all", "Todo"],
              ["friends", "Amigos"],
              ["following", "Seguidos"],
            ].map(([id, label]) => (
              <button
                className={mode === id ? "active" : ""}
                key={id}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {feed.isPending ? (
            <Loading />
          ) : feed.isError ? (
            <ErrorState error={feed.error} />
          ) : feed.data.pages.flat().length === 0 ? (
            <Empty title="Cada buena historia empieza con alguien">
              <p>
                Agregá amigos o seguí personas para descubrir sus experiencias.
                Solo vas a ver lo que compartan con vos.
              </p>
              <Link className="button primary" to="/personas">
                Encontrar personas <ArrowRight size={17} />
              </Link>
            </Empty>
          ) : (
            <div className="feed-items">
              {feed.data.pages.flat().map((e) =>
                e.entry_type === "review" ? (
                  <ReviewCard key={e.id} review={e} withPlace />
                ) : (
                  <article className="review-card visit-feed" key={e.id}>
                    <Check size={24} />
                    <div>
                      <Link to={`/persona/${e.user_id}`}>
                        <strong>{e.profiles?.display_name}</strong>
                      </Link>{" "}
                      compartió una visita
                      <p>
                        <PlaceLink
                          id={e.place_id}
                          name={e.places?.name || "Ver lugar"}
                        />
                      </p>
                      <small>
                        {new Date(e.created_at).toLocaleDateString("es-AR")}{" "}
                        {e.visited_on && `· visitó el ${e.visited_on}`}
                      </small>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
          {feed.hasNextPage && (
            <button
              className="button secondary"
              disabled={feed.isFetchingNextPage}
              onClick={() => feed.fetchNextPage()}
            >
              Cargar más experiencias
            </button>
          )}
        </>
      )}
    </div>
  );
}
