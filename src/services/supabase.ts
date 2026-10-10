import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "../config/supabase";
const connection = resolveSupabaseConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
export const configured = Boolean(connection);
export const supabase = connection
  ? createClient(connection.url, connection.key, {
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
  if (error.message.includes("Email not confirmed"))
    throw new Error(
      "Confirmá tu correo antes de ingresar. Revisá el mensaje de registro y la carpeta de spam.",
    );
  throw new Error(error.message);
}
