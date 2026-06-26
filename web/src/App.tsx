import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StatusProvider } from "@/lib/status";
import { JobsProvider } from "@/lib/jobs";
import { AuthGate } from "@/components/auth/AuthGate";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ConnectionScreen } from "@/screens/ConnectionScreen";
import { BooksScreen } from "@/screens/BooksScreen";
import { BookDetailScreen } from "@/screens/BookDetailScreen";
import { PlannerScreen } from "@/screens/PlannerScreen";
import { ProgrammatiScreen } from "@/screens/ProgrammatiScreen";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { InsightsScreen } from "@/screens/InsightsScreen";
import { GestionePaginaScreen } from "@/screens/GestionePaginaScreen";
import { ImpostazioniScreen } from "@/screens/ImpostazioniScreen";

export function App() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);
  return (
    <AuthGate>
    <StatusProvider>
      <JobsProvider>
        <div className="flex h-screen overflow-hidden bg-bg-base">
          <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header onMenu={() => setNavOpen(true)} />
            <main className="flex-1 overflow-y-auto">
              {/* key on top-level section so entrance animation replays on nav */}
              <div
                key={location.pathname.split("/").slice(0, 2).join("/")}
                className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-8 xl:px-8 animate-fade-in"
              >
                <Routes location={location}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/connessione" element={<ConnectionScreen />} />
                  <Route path="/libri" element={<BooksScreen />} />
                  <Route path="/libri/:id" element={<BookDetailScreen />} />
                  <Route path="/pianificatore" element={<PlannerScreen />} />
                  <Route path="/programmati" element={<ProgrammatiScreen />} />
                  <Route path="/insight" element={<InsightsScreen />} />
                  <Route path="/gestione" element={<GestionePaginaScreen />} />
                  <Route path="/impostazioni" element={<ImpostazioniScreen />} />
                  <Route path="/dashboard" element={<DashboardScreen />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </div>
            </main>
          </div>
        </div>
      </JobsProvider>
    </StatusProvider>
    </AuthGate>
  );
}
