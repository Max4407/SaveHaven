import { useMutation, useQueryClient } from "@tanstack/react-query";
import { demoLogin } from "../../api/auth";
import { isApiError } from "../../api/client";

export function LoginPage() {
  const queryClient = useQueryClient();
  const loginMutation = useMutation({
    mutationFn: () => demoLogin(),
    onSuccess: (user) => queryClient.setQueryData(["session"], user),
  });

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <span className="page-mark auth-mark" aria-hidden="true">S</span>
        <p className="eyebrow">SaveHaven demo</p>
        <h1 id="login-heading">Grow savings into something you can see.</h1>
        <p>
          Sign in with the pre-seeded demo profile. SaveHaven uses fictional Capital One Nessie
          sandbox data and never asks for real banking credentials.
        </p>
        {loginMutation.error ? (
          <p className="error-banner" role="alert">
            {isApiError(loginMutation.error)
              ? loginMutation.error.message
              : "The demo session could not be started."}
          </p>
        ) : null}
        <button
          className="primary-button"
          type="button"
          disabled={loginMutation.isPending}
          onClick={() => loginMutation.mutate()}
        >
          {loginMutation.isPending ? "Starting demo…" : "Enter the demo"}
        </button>
      </section>
    </main>
  );
}
