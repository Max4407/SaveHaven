import { useMutation, useQueryClient } from "@tanstack/react-query";
import { demoLogin } from "../../api/auth";
import { isApiError } from "../../api/client";

const DEMO_USERS = [
  { id: "demo-player", displayName: "Demo Player", description: "Primary demo profile" },
  { id: "demo-reviewer", displayName: "Demo Reviewer", description: "Second saved profile" },
] as const;

export function LoginPage() {
  const queryClient = useQueryClient();
  const loginMutation = useMutation({
    mutationFn: (userId: string) => demoLogin(userId),
    onSuccess: (user) => {
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      queryClient.setQueryData(["session"], user);
    },
  });

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <span className="page-mark auth-mark" aria-hidden="true">S</span>
        <p className="eyebrow">SaveHaven demo</p>
        <h1 id="login-heading">Grow savings into something you can see.</h1>
        <p>
          Choose a pre-seeded demo profile. Each person keeps their own savings goals and town.
          SaveHaven uses fictional Capital One Nessie sandbox data and never asks for real banking
          credentials.
        </p>
        {loginMutation.error ? (
          <p className="error-banner" role="alert">
            {isApiError(loginMutation.error)
              ? loginMutation.error.message
              : "The demo session could not be started."}
          </p>
        ) : null}
        <div className="auth-user-list" aria-label="Choose a demo user">
          {DEMO_USERS.map((user) => (
            <button
              className="auth-user-option"
              type="button"
              key={user.id}
              aria-label={`Continue as ${user.displayName}`}
              disabled={loginMutation.isPending}
              onClick={() => loginMutation.mutate(user.id)}
            >
              <span className="auth-user-avatar" aria-hidden="true">
                {user.displayName.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.description}</small>
              </span>
              <span className="auth-user-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
        {loginMutation.isPending ? <p className="auth-login-status" role="status">Signing in…</p> : null}
      </section>
    </main>
  );
}
