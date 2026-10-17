import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { logout } from "../api/auth";
import type { SessionUser } from "../api/types";

const navItems = [
  { label: "Town", icon: "◇", to: "/town" },
  { label: "Bank & goals", icon: "$", to: "/dashboard" },
];

type AppShellProps = {
  user: SessionUser;
};

export function AppShell({ user }: AppShellProps) {
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
      <div className="session-controls" aria-label="Demo session">
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
      <nav className="tab-bar" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            className={({ isActive }) => `tab-link${isActive ? " active" : ""}`}
            to={item.to}
            key={item.to}
          >
            <span className="tab-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
