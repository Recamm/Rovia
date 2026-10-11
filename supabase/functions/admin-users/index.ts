import { createClient } from "@supabase/supabase-js";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (
    Deno.env.get("ALLOWED_ORIGINS") ??
    "http://localhost:5173,https://userovia.vercel.app,https://rovia-camilo.camiloreartes126.chatgpt.site"
  ).split(",");
  const headers = {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization,x-client-info,apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const json = (v: unknown, status = 200) =>
    Response.json(v, { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: { Authorization: req.headers.get("authorization") ?? "" },
    },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) return json({ error: "Iniciá sesión" }, 401);
    const { data: isAdmin, error: roleError } = await client.rpc("is_admin");
    if (roleError || !isAdmin)
      return json({ error: "Acceso de administrador requerido" }, 403);
    // JWT signature was checked by getUser; also require a live session, not a revoked token.
    const token = (req.headers.get("authorization") ?? "").replace(
      /^Bearer /i,
      "",
    );
    const claims = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    const { data: active, error: sessionError } = await admin.rpc(
      "admin_session_active",
      { actor: user.id, sid: claims.session_id },
    );
    if (sessionError || !active)
      return json({ error: "Volvé a iniciar sesión" }, 401);
    const { error: rateError } = await client.rpc("admin_user_rate");
    if (rateError)
      return json({ error: "Esperá un minuto antes de continuar" }, 429);
    const body = await req.json();
    if (body.action === "list") {
      const page = Number(body.page ?? 1);
      if (!Number.isInteger(page) || page < 1 || page > 10000)
        return json({ error: "Página inválida" }, 400);
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 30,
      });
      if (error) throw error;
      const { data: roles, error: re } = await client.rpc("admin_roles");
      if (re) throw re;
      const ids = data.users.map((u) => u.id);
      const { data: profiles, error: pe } = ids.length
        ? await admin
            .from("profiles")
            .select("id,username,display_name")
            .in("id", ids)
        : { data: [], error: null };
      if (pe) throw pe;
      const { data: lifecycle } = await client.rpc("admin_lifecycle_enabled");
      return json({
        lifecycle_enabled: lifecycle === true,
        users: data.users.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          banned_until: u.banned_until,
          profile: profiles?.find((p) => p.id === u.id),
          is_admin: roles?.some((r: { user_id: string }) => r.user_id === u.id),
        })),
        has_more: data.users.length === 30,
      });
    }
    if (body.action === "create") {
      if (
        typeof body.email !== "string" ||
        !body.email.includes("@") ||
        typeof body.password !== "string" ||
        body.password.length < 12 ||
        typeof body.username !== "string" ||
        !/^[a-z0-9_]{3,24}$/.test(body.username) ||
        typeof body.display_name !== "string" ||
        body.display_name.trim().length < 1 ||
        body.display_name.length > 80
      )
        return json(
          {
            error:
              "Completá correo, usuario, nombre y contraseña temporal de al menos 12 caracteres",
          },
          400,
        );
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          username: body.username,
          display_name: body.display_name.trim(),
        },
      });
      if (error) throw error;
      const { error: audit } = await admin.rpc("admin_log_user_action", {
        actor: user.id,
        target: data.user.id,
        operation: "create_user",
      });
      if (audit) throw audit;
      return json({ ok: true });
    }
    if (body.action === "hide_post") {
      if (!uuid.test(body.post_id) || typeof body.hidden !== "boolean")
        return json({ error: "Publicación inválida" }, 400);
      const { data, error } = await admin
        .from("posts")
        .update({ hidden: body.hidden })
        .eq("id", body.post_id)
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Publicación inexistente");
      const { error: audit } = await admin.rpc("admin_log_user_action", {
        actor: user.id,
        target: body.post_id,
        operation: body.hidden ? "hide_post" : "restore_post",
      });
      if (audit) throw audit;
      return json({ ok: true });
    }
    if (!uuid.test(body.user_id))
      return json({ error: "Usuario inválido" }, 400);
    const target = body.user_id;
    const { data: targetData, error: targetError } =
      await admin.auth.admin.getUserById(target);
    if (targetError || !targetData.user)
      throw targetError ?? new Error("Cuenta inexistente");
    const { data: roles, error: re } = await client.rpc("admin_roles");
    if (re) throw re;
    const targetIsAdmin = roles?.some(
      (r: { user_id: string }) => r.user_id === target,
    );
    if (body.action === "role") {
      if (typeof body.enabled !== "boolean")
        return json({ error: "Rol inválido" }, 400);
      const { error } = await client.rpc("admin_set_role", {
        target,
        enabled: body.enabled,
      });
      if (error) throw error;
      return json({ ok: true });
    }
    if (
      ["suspend", "delete"].includes(body.action) &&
      (target === user.id || targetIsAdmin)
    )
      return json(
        {
          error:
            "Primero retirale el rol de administrador desde otra cuenta. No podés suspender ni eliminar tu propia cuenta.",
        },
        400,
      );
    if (["suspend", "restore", "delete"].includes(body.action)) {
      const { data: enabled, error } = await client.rpc(
        "admin_lifecycle_enabled",
      );
      if (error || !enabled)
        return json(
          {
            error:
              "La suspensión y eliminación están pendientes de habilitación. La gestión básica ya está disponible.",
          },
          409,
        );
    }
    if (body.action === "reset") {
      const { error } = await admin.auth.resetPasswordForEmail(
        targetData.user.email!,
        { redirectTo: "https://userovia.vercel.app/auth/reset" },
      );
      if (error) throw error;
    } else if (body.action === "suspend" || body.action === "restore") {
      const { error } = await admin.auth.admin.updateUserById(target, {
        ban_duration: body.action === "suspend" ? "876000h" : "none",
      });
      if (error) throw error;
      const { error: disabled } = await admin.rpc("admin_disable_account", {
        target,
        disabled: body.action === "suspend",
      });
      if (disabled) throw disabled;
      if (body.action === "suspend") {
        const { error: revoked } = await admin.rpc("admin_revoke_sessions", {
          target,
        });
        if (revoked) throw revoked;
      }
    } else if (body.action === "delete") {
      if (body.confirm_email !== targetData.user.email)
        return json(
          { error: "Escribí el correo exacto para confirmar la eliminación" },
          400,
        );
      const { error: revoked } = await admin.rpc("admin_revoke_sessions", {
        target,
      });
      if (revoked) throw revoked;
      const { error } = await admin.auth.admin.deleteUser(target);
      if (error) throw error;
    } else return json({ error: "Acción inválida" }, 400);
    const { error: audit } = await admin.rpc("admin_log_user_action", {
      actor: user.id,
      target,
      operation: body.action,
    });
    if (audit) throw audit;
    return json({ ok: true });
  } catch (error) {
    // Do not log payloads, passwords, access tokens or recovery URLs.
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos completar la operación",
      },
      400,
    );
  }
});
