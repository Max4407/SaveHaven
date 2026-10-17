import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getSession } from "./api/auth";
import { isApiError } from "./api/client";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";

const TownPage = lazy(() => import("./features/town/TownPage"));

function App() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    retry: (failureCount, error) => !isApiError(error, 401) && failureCount < 1,
  });

  if (sessionQuery.isPending) {
    return <div className="route-loading" role="status">Checking your demo session…</div>;
  }

  if (sessionQuery.isError) {
    return (
      <main className="status-page">
        <section className="status-card">
          <p className="eyebrow">Connection problem</p>
          <h1>The SaveHaven API is unavailable.</h1>
          <p>Start the FastAPI server on port 8000, then try again.</p>
          <button className="primary-button" type="button" onClick={() => sessionQuery.refetch()}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (!sessionQuery.data) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppShell user={sessionQuery.data} />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
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
