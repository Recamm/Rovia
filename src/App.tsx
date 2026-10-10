import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider } from "./hooks/useApp";
import Layout from "./components/Layout";
import Explore from "./pages/Explore";
import PlaceDetail from "./pages/PlaceDetail";
import ReviewForm from "./pages/ReviewForm";
import Auth from "./pages/Auth";
import Library from "./pages/Library";
import ListDetail from "./pages/ListDetail";
import People from "./pages/People";
import Feed from "./pages/Feed";
import Profile from "./pages/Profile";
import Connections from "./pages/Connections";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Moderation from "./pages/Moderation";
import SuggestPlace from "./pages/SuggestPlace";
import Admin from "./pages/Admin";
import { Empty } from "./components/UI";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10000, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});
export default function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AppProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Explore />} />
              <Route path="local/:id" element={<PlaceDetail />} />
              <Route path="local/:id/resena" element={<ReviewForm />} />
              <Route path="actividad" element={<Feed />} />
              <Route path="guardados" element={<Library />} />
              <Route path="lista/:id" element={<ListDetail />} />
              <Route path="personas" element={<People />} />
              <Route path="perfil" element={<Profile />} />
              <Route path="persona/:id" element={<Profile />} />
              <Route path="persona/:id/conexiones" element={<Connections />} />
              <Route path="notificaciones" element={<Notifications />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="moderacion" element={<Moderation />} />
              <Route path="sugerir-local" element={<SuggestPlace />} />
              <Route path="admin" element={<Admin />} />
              <Route path="auth" element={<Auth />} />
              <Route path="auth/callback" element={<Auth />} />
              <Route path="auth/reset" element={<Auth />} />
              <Route
                path="*"
                element={
                  <Empty title="Este camino no lleva a un lugar">
                    <Link className="button primary" to="/">
                      Volver al mapa
                    </Link>
                  </Empty>
                }
              />
            </Route>
          </Routes>
        </AppProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
