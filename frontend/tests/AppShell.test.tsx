import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "../src/components/AppShell";
afterEach(cleanup);

describe("player town progress", () => {
  it.each([["Jordan Lee", "JL"], ["Jordan Morgan Lee", "JL"], ["Jordan", "J"]])("uses first and last initials for %s", (name, initials) => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/town"]}>
      <AppShell user={{ id: "demo-player", display_name: name }} />
    </MemoryRouter></QueryClientProvider>);
    const player = screen.getByLabelText("Demo session");
    expect(within(player).getByText(initials)).toHaveClass("avatar");
    expect(within(player).queryByLabelText("Town level progress")).not.toBeInTheDocument();
  });
});
