import { createClient } from "@supabase/supabase-js";
Deno.serve(async (req) => {
  const secret = Deno.env.get("PHOTO_CLEANUP_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "No autorizado" }, { status: 401 });
  if (req.method !== "POST")
    return Response.json({ error: "Método no permitido" }, { status: 405 });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.rpc("photo_gc_batch");
  if (error)
    return Response.json({ error: "No se pudo leer la cola" }, { status: 500 });
  let removed = 0;
  for (const bucket of ["review-photos", "avatars"]) {
    const paths = (data ?? [])
      .filter((x: { bucket: string }) => x.bucket === bucket)
      .map((x: { path: string }) => x.path);
    if (!paths.length) continue;
    const live = new Set<string>();
    if (bucket === "review-photos") {
      const [full, thumb] = await Promise.all([
        admin
          .from("review_photos")
          .select("path,thumbnail_path")
          .in("path", paths),
        admin
          .from("review_photos")
          .select("path,thumbnail_path")
          .in("thumbnail_path", paths),
      ]);
      if (full.error || thumb.error)
        return Response.json(
          { error: "No se pudo comprobar referencias. Cola conservada." },
          { status: 500 },
        );
      [...(full.data ?? []), ...(thumb.data ?? [])].forEach((p) => {
        live.add(p.path);
        live.add(p.thumbnail_path);
      });
    } else {
      const { data: avatars, error: e } = await admin
        .from("profiles")
        .select("avatar_path")
        .in("avatar_path", paths);
      if (e)
        return Response.json(
          { error: "No se pudo comprobar avatares." },
          { status: 500 },
        );
      avatars?.forEach((p) => live.add(p.avatar_path));
    }
    const orphaned = paths.filter((p: string) => !live.has(p));
    const { error: e } = orphaned.length
      ? await admin.storage.from(bucket).remove(orphaned)
      : { error: null };
    if (e)
      return Response.json(
        { error: "Limpieza incompleta. Se conserva la cola." },
        { status: 500 },
      );
    const { error: ack } = await admin.rpc("photo_gc_done", { paths });
    if (ack)
      return Response.json(
        { error: "Archivos retirados. La cola se reintentará." },
        { status: 500 },
      );
    removed += orphaned.length;
  }
  return Response.json({ ok: true, removed });
});
