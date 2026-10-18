import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { demoLogin } from "../../api/auth";
import { isApiError } from "../../api/client";

const DEMO_ACCOUNTS = [
  { email: "jordan.lee@savehaven.demo", displayName: "Jordan Lee" },
  { email: "alex.morgan@savehaven.demo", displayName: "Alex Morgan" },
  { email: "taylor.kim@savehaven.demo", displayName: "Taylor Kim" },
] as const;

export function LoginPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string>(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState("");
  const loginMutation = useMutation({
    mutationFn: () => demoLogin(email, password),
    onSuccess: (user) => {
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      queryClient.setQueryData(["session"], user);
    },
  });

  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loginMutation.mutate();
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <span className="page-mark auth-mark" aria-hidden="true">S</span>
        <p className="eyebrow">SaveHaven</p>
        <h1 id="login-heading">Welcome back.</h1>
        <p>
          Sign in to continue to your saved plan and town. This prototype accepts only the
          fictional accounts below and never asks for real banking credentials.
        </p>
        {loginMutation.error ? (
          <p className="error-banner" role="alert">
            {isApiError(loginMutation.error)
              ? loginMutation.error.message
              : "The demo session could not be started."}
          </p>
        ) : null}
        <form className="auth-login-form" onSubmit={submitLogin}>
          <label htmlFor="login-email">
            Email
            <select
              id="login-email"
              value={email}
              autoComplete="username"
              disabled={loginMutation.isPending}
              onChange={(event) => setEmail(event.target.value)}
            >
              {DEMO_ACCOUNTS.map((account) => (
                <option value={account.email} key={account.email}>
                  {account.displayName} — {account.email}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="login-password">
            Password
            <input
              id="login-password"
              type="password"
              value={password}
              autoComplete="current-password"
              disabled={loginMutation.isPending}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <p className="demo-credential-note">
            Demo password: <code>savehaven-demo</code>
          </p>
          <button className="primary-button" type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
