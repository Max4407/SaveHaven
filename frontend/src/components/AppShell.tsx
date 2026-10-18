import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "react-router-dom";
import { logout } from "../api/auth";
import type { SessionUser } from "../api/types";

type AppShellProps = {
  user: SessionUser;
};

export function AppShell({ user }: AppShellProps) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.cancelQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      queryClient.setQueryData(["session"], null);
    },
  });

  return (
    <div className="app-shell">
      <Outlet />
      {!location.pathname.startsWith("/town") ? (
        <nav className="town-launcher" aria-label="Town navigation">
          <Link className="town-launch-button" to="/town">
            <svg className="town-launch-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M3 15 16 4l13 11M7 13v15h18V13M13 28V18h6v10" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
              <path d="M23 5v5" stroke="currentColor" strokeWidth="3" />
            </svg>
            <span><small>Your savings. Your world.</small><strong>Build your town</strong></span>
            <span className="town-launch-arrow" aria-hidden="true">→</span>
          </Link>
        </nav>
      ) : null}
      <div
        className={`session-controls${location.pathname.startsWith("/dashboard") ? " bank-session-controls" : ""}${location.pathname.startsWith("/town") ? " town-session-controls" : ""}`}
        aria-label="Demo session"
      >
        <span className="avatar" aria-hidden="true">{user.display_name.slice(0, 2).toUpperCase()}</span>
        <span>{user.display_name}</span>
        <button
          className="text-button"
          type="button"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          {logoutMutation.isPending
            ? "Signing out…"
            : logoutMutation.isError ? "Retry sign out" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
