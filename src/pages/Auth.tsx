import { useState, useEffect } from "react";
import {
  Link,
  useSearchParams,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { ArrowRight, ArrowLeft, Compass, Eye, EyeOff } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { db, fail, configured } from "../services/supabase";
import { validateUsername } from "../domain/rules";
import { ConnectionNote, ErrorState } from "../components/UI";
export default function Auth() {
  const [params] = useSearchParams();
  const location = useLocation();
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(
    location.pathname === "/auth/reset" ? "reset" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const { session, ready } = useApp();
  const navigate = useNavigate();
  const rawNext = params.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  useEffect(() => {
    if (
      session &&
      ready &&
      mode !== "reset" &&
      location.pathname != "/auth/reset"
    )
      navigate(next, { replace: true });
  }, [session, ready, mode, next]);
  useEffect(() => {
    if (params.get("error_description"))
      setError(
        "El enlace de autenticación venció o no es válido. Solicitá uno nuevo.",
      );
  }, [params]);
  async function submit() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const client = db();
      if (mode === "signup") {
        if (!validateUsername(username))
          throw new Error(
            "El usuario debe tener entre 3 y 24 letras minúsculas, números o guiones bajos.",
          );
        const { error: e } = await client.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username.toLowerCase(),
              display_name: name.trim(),
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        fail(e);
        setMessage(
          "Revisá tu correo para confirmar la cuenta. Si no llega, verificá la configuración de SMTP.",
        );
      } else if (mode === "forgot") {
        const { error: e } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/reset`,
        });
        fail(e);
        setMessage(
          "Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.",
        );
      } else if (mode === "reset") {
        if (!session)
          throw new Error(
            "Abrí el enlace de recuperación que recibiste por correo.",
          );
        const { error: e } = await client.auth.updateUser({ password });
        fail(e);
        setMessage("Contraseña actualizada.");
        navigate("/perfil");
      } else {
        const { error: e } = await client.auth.signInWithPassword({
          email,
          password,
        });
        fail(e);
        navigate(next);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-art">
        <span className="eyebrow">TUS LUGARES, CON TU GENTE</span>
        <h1>
          Los planes más lindos
          <br />
          empiezan con
          <br />
          <span className="serif">un descubrimiento.</span>
        </h1>
        <div className="auth-illustration">
          <div className="orbit o1" />
          <div className="orbit o2" />
          <div className="orbit o3" />
          <Compass size={90} />
          <span className="auth-pin">r</span>
        </div>
        <p>
          Guardá ese café pendiente.
          <br />
          Compartí esa buena historia.
          <br />
          Armá tu próxima salida.
        </p>
      </section>
      <section className="auth-form-panel">
        <Link className="back-link" to="/">
          <ArrowLeft size={17} />
          Volver al mapa
        </Link>
        <h2>
          {mode === "signup"
            ? "Hacete un lugar"
            : mode === "forgot"
              ? "Recuperá tu cuenta"
              : mode === "reset"
                ? "Una nueva contraseña"
                : "Qué bueno verte por acá"}
          <span className="coral">.</span>
        </h2>
        <p className="muted">
          {mode === "signup"
            ? "Creá tu cuenta y empezá a armar tus planes."
            : mode === "login"
              ? "Ingresá para seguir descubriendo."
              : "Te ayudamos a volver a Rovia."}
        </p>
        <ConnectionNote />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "signup" && (
            <>
              <label>
                Tu nombre
                <input
                  autoComplete="name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Nombre de usuario
                <input
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-z0-9_]+"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
              </label>
            </>
          )}
          {mode !== "reset" && (
            <label>
              Correo electrónico
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Contraseña
              <div className="password-input">
                <input
                  type={show ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={
                    show ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  onClick={() => setShow((v) => !v)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {mode !== "login" && (
                <span className="help">Como mínimo 8 caracteres.</span>
              )}
            </label>
          )}
          {mode === "login" && (
            <button
              type="button"
              className="text-link forgot"
              onClick={() => {
                setMode("forgot");
                setError("");
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
          {error && <ErrorState error={new Error(error)} />}{" "}
          {message && (
            <div className="success" role="status">
              {message}
            </div>
          )}
          <button
            className="button primary wide"
            disabled={busy || !configured}
          >
            {busy
              ? "Un momento…"
              : mode === "signup"
                ? "Crear mi cuenta"
                : mode === "forgot"
                  ? "Enviar enlace"
                  : mode === "reset"
                    ? "Guardar contraseña"
                    : "Ingresar"}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="auth-switch">
          {mode === "login" ? (
            <>
              ¿Todavía no tenés cuenta?{" "}
              <button
                className="text-link"
                onClick={() => {
                  setMode("signup");
                  setError("");
                  setMessage("");
                }}
              >
                Registrate
              </button>
            </>
          ) : (
            <button
              className="text-link"
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
              }}
            >
              Volver a iniciar sesión
            </button>
          )}
        </div>
        <p className="help">
          Tus visitas se comparten solo cuando vos lo elegís.
        </p>
      </section>
    </div>
  );
}
