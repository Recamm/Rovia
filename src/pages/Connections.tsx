import { useSearchParams, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Profile } from "../types";
import { rpc } from "../services/api";
import { useApp } from "../hooks/useApp";
import { PageTitle, Empty, Loading, ErrorState } from "../components/UI";
import { PersonCard } from "./People";
export default function Connections() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const mode = params.get("tab") ?? "friends";
  const { session } = useApp();
  const q = useQuery({
    queryKey: ["connections", id, mode, session?.user.id],
    queryFn: async () =>
      rpc("profile_connections", { uid: id, mode }) as Promise<Profile[]>,
  });
  return (
    <div className="content-page">
      <Link className="back-link" to={`/persona/${id}`}>
        ← Volver al perfil
      </Link>
      <PageTitle
        eyebrow="COMUNIDAD"
        title="Sus conexiones"
        description="Estas relaciones se muestran según los permisos actuales."
      />
      <div className="tabs">
        {[
          ["friends", "Amigos"],
          ["followers", "Seguidores"],
          ["following", "Seguidos"],
        ].map(([v, label]) => (
          <button
            className={mode === v ? "active" : ""}
            onClick={() => setParams({ tab: v })}
            key={v}
          >
            {label}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : q.data?.length ? (
        q.data.map((p) => <PersonCard profile={p} key={p.id} />)
      ) : (
        <Empty title="Sin conexiones accesibles" />
      )}
    </div>
  );
}
