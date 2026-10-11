import { useInfiniteQuery } from "@tanstack/react-query";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import type { Post } from "../types";
import { Loading, ErrorState, Empty } from "./UI";
import PostCard from "./PostCard";
export default function PostsFeed({ mode }: { mode: string }) {
  const { session } = useApp();
  const q = useInfiniteQuery({
    queryKey: ["post-feed", mode, session?.user.id],
    initialPageParam: null as { time: string; id: string } | null,
    queryFn: ({ pageParam }) =>
      rpc("post_feed", {
        mode,
        before_time: pageParam?.time ?? null,
        before_id: pageParam?.id ?? null,
      }) as Promise<Post[]>,
    getNextPageParam: (last) =>
      last.length === 20
        ? { time: last.at(-1)!.created_at, id: last.at(-1)!.id }
        : undefined,
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <>
      {q.data.pages.flat().length ? (
        q.data.pages.flat().map((p) => <PostCard key={p.id} post={p} />)
      ) : (
        <Empty title="Todavía no hay publicaciones para mostrar" />
      )}
      {q.hasNextPage && (
        <button
          className="button secondary"
          disabled={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
        >
          Cargar más publicaciones
        </button>
      )}
    </>
  );
}
