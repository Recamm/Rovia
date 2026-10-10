import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export function db() {
  if (!supabase)
    throw new Error(
      "Conexión pendiente: configurá Supabase para usar cuentas y guardar tus cambios.",
    );
  return supabase;
}
export function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "23505")
    throw new Error(
      "Ese registro ya existe. Actualizá la pantalla para consultar el estado actual.",
    );
  if (error.code === "42501")
    throw new Error("No tenés permiso para esta acción.");
  if (error.message.includes("Invalid login credentials"))
    throw new Error("El correo o la contraseña no son correctos.");
  throw new Error(error.message);
}
