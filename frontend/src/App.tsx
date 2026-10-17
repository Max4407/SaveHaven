import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./features/dashboard/DashboardPage";

const TownPage = lazy(() => import("./features/town/TownPage"));

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/town" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route
          path="town"
          element={
            <Suspense fallback={<div className="route-loading">Preparing your town…</div>}>
              <TownPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
