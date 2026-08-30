import { Link, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Admin } from "./pages/Admin";
import { Landing } from "./pages/Landing";
import { League } from "./pages/League";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { FindPartner } from "./pages/FindPartner";
import { Members } from "./pages/Members";
import { MatchCreate } from "./pages/MatchCreate";
import { MatchDetail } from "./pages/MatchDetail";
import { Matches } from "./pages/Matches";
import { PlayerMatches } from "./pages/PlayerMatches";
import { Profile } from "./pages/Profile";

function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-court px-6 text-center text-line">
      <h1 className="font-display text-7xl">404</h1>
      <p className="mt-2 text-line/70">Siden findes ikke.</p>
      <Link to="/" className="mt-6 text-sm font-semibold text-ball hover:underline">
        Tilbage til Padel By Ramm
      </Link>
    </main>
  );
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/glemt-adgangskode" element={<ForgotPassword />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/profil/:username/kampe" element={<PlayerMatches />} />
        <Route path="/profil/:username" element={<Profile />} />
        <Route path="/find-partner" element={<FindPartner />} />
        <Route path="/medlemmer" element={<Members />} />
        <Route path="/liga" element={<League />} />
        <Route path="/kampe" element={<Matches />} />
        <Route path="/kampe/ny" element={<MatchCreate />} />
        <Route path="/kampe/:matchId" element={<MatchDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
