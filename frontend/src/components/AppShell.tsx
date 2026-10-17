import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation } from "react-router-dom";
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
    onSuccess: () => {
      queryClient.setQueryData(["session"], null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
    },
  });

  return (
    <div className="app-shell">
      <Outlet />
      {location.pathname.startsWith("/dashboard") ? (
        <div className="session-controls bank-session-controls" aria-label="Demo session">
          <span className="avatar" aria-hidden="true">{user.display_name.slice(0, 2).toUpperCase()}</span>
          <span>{user.display_name}</span>
          <button
            className="text-button"
            type="button"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            {logoutMutation.isPending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
