import { createClient } from "@supabase/supabase-js";
import { initializeImageMagick } from "@imagemagick/magick-wasm";
import { processImage } from "../_shared/process-image.ts";
// CLI deployments bundle the binary. Text-only deployments use the identical,
// pinned artifact, verified before any code is initialized.
const wasmHash =
  "b7d6710436b150dc5bd1ca04d80b6b7614c54854d7470f888f7e69a2a41b00e4";
let wasm: Promise<void> | undefined;
function loadWasm() {
  return (wasm ??= (async () => {
    let bytes: Uint8Array;
    try {
      bytes = await Deno.readFile(new URL("./magick.wasm", import.meta.url));
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      const response = await fetch(
        "https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.44/dist/x86/magick.wasm",
        { signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok) throw new Error("Image processor unavailable");
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    );
    const hex = Array.from(digest, (v) => v.toString(16).padStart(2, "0")).join(
      "",
    );
    if (hex !== wasmHash)
      throw new Error("Image processor integrity check failed");
    await initializeImageMagick(bytes);
  })().catch((error) => {
    wasm = undefined;
    throw error;
  }));
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function headers(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (
    Deno.env.get("ALLOWED_ORIGINS") ??
    "http://localhost:5173,https://rovia-camilo.camiloreartes126.chatgpt.site"
  ).split(",");
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization,x-client-info,apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
}
Deno.serve(async (req) => {
  const cors = headers(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")
    return Response.json(
      { error: "Método no permitido" },
      { status: 405, headers: cors },
    );
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: cors });
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("authorization") ?? "" },
      },
    },
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let uploaded: string[] = [];
  let bucket = "review-photos";
  try {
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) return json({ error: "Iniciá sesión." }, 401);
    const { error: rate } = await client.rpc("photo_rate");
    if (rate)
      return json({ error: "Esperá un minuto antes de subir más fotos." }, 429);
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();
      if (body.action === "remove") {
        if (!uuid.test(body.photo_id))
          return json({ error: "Foto inválida." }, 400);
        const { data: photo, error } = await admin
          .from("review_photos")
          .select("id,path,thumbnail_path,review_id")
          .eq("id", body.photo_id)
          .single();
        const { data: owner } = photo
          ? await admin
              .from("reviews")
              .select("user_id")
              .eq("id", photo.review_id)
              .single()
          : { data: null };
        if (error || !photo || owner?.user_id !== user.id)
          return json({ error: "Foto no disponible." }, 403);
        const { error: deleted } = await admin
          .from("review_photos")
          .delete()
          .eq("id", body.photo_id);
        if (deleted) throw deleted;
        return json({ ok: true });
      }
      return json({ error: "Acción inválida." }, 400);
    }
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > 5 * 1024 * 1024 + 65536)
      return json({ error: "Archivo demasiado grande." }, 413);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
      return json({ error: "Subí una imagen de hasta 5 MB." }, 400);
    const avatar = form.get("mode") === "avatar";
    bucket = avatar ? "avatars" : "review-photos";
    const reviewId = String(form.get("review_id") ?? "");
    if (!avatar) {
      if (!uuid.test(reviewId)) return json({ error: "Reseña inválida." }, 400);
      const { data: r, error } = await admin
        .from("reviews")
        .select("user_id,archived")
        .eq("id", reviewId)
        .single();
      if (error || !r || r.user_id !== user.id || r.archived)
        return json({ error: "No podés agregar fotos a esta reseña." }, 403);
    }
    await loadWasm();
    const processed = processImage(
      new Uint8Array(await file.arrayBuffer()),
      avatar,
    );
    const token = crypto.randomUUID();
    const path = `${user.id}/${avatar ? "avatar" : reviewId}/${token}.jpg`;
    const thumbnail = `${user.id}/${reviewId}/${token}-thumb.jpg`;
    const planned = avatar ? [path] : [path, thumbnail];
    const { error: ledgerError } = await admin.rpc("enqueue_photo_gc", {
      paths: planned,
      bucket_name: bucket,
    });
    if (ledgerError) throw ledgerError;
    for (const [key, bytes] of avatar
      ? [[path, processed.full] as const]
      : [
          [path, processed.full] as const,
          [thumbnail, processed.thumb] as const,
        ]) {
      const { error } = await admin.storage
        .from(bucket)
        .upload(key, bytes, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      uploaded.push(key);
    }
    if (avatar) {
      const { data: old } = await admin
        .from("profiles")
        .select("avatar_path")
        .eq("id", user.id)
        .single();
      const { error } = await admin
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", user.id);
      if (error) throw error;
      if (old?.avatar_path)
        await admin.rpc("enqueue_photo_gc", {
          paths: [old.avatar_path],
          bucket_name: "avatars",
        });
    } else {
      const { error } = await admin
        .from("review_photos")
        .insert({ review_id: reviewId, path, thumbnail_path: thumbnail });
      if (error) throw error;
    }
    uploaded = [];
    await admin.rpc("photo_gc_done", { paths: planned });
    return json({ ok: true, path });
  } catch (error) {
    if (uploaded.length) {
      await admin.rpc("enqueue_photo_gc", {
        paths: uploaded,
        bucket_name: bucket,
      });
      await admin.storage.from(bucket).remove(uploaded);
    }
    console.error(
      "image-upload rejected",
      error instanceof Error ? error.name : "operation",
    );
    return json(
      {
        error:
          "No pudimos procesar la foto. Usá una imagen JPEG, PNG o WebP válida de hasta 5 MB y 8 megapíxeles.",
      },
      400,
    );
  }
});
