import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
export type ThemePreference = "light" | "dark" | "system";
const Context = createContext<{
  preference: ThemePreference;
  theme: "light" | "dark";
  setPreference: (v: ThemePreference) => void;
}>({ preference: "system", theme: "light", setPreference: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    try {
      const value = localStorage.getItem("rovia-theme");
      return value === "dark" || value === "light" ? value : "system";
    } catch {
      return "system";
    }
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  const theme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("rovia-theme", preference);
    } catch {}
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#181D1C" : "#C64E3B");
    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute("href", `/manifest-${theme}.webmanifest`);
    document
      .querySelector('link[rel="apple-touch-icon"]')
      ?.setAttribute("href", `/icons/rovia-${theme}-180-v2.png`);
    document
      .querySelectorAll('link[rel="icon"]')
      .forEach((el) => el.setAttribute("href", `/logo-${theme}.svg`));
  }, [theme, preference]);
  return (
    <Context.Provider value={{ preference, theme, setPreference }}>
      {children}
    </Context.Provider>
  );
}
export function useTheme() {
  return useContext(Context);
}
