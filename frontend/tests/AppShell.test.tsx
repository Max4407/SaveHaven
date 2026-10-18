import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/AppShell";
import type { GameState } from "../src/api/types";

vi.mock("../src/api/game", () => ({ getGameState: vi.fn() }));
afterEach(cleanup);

describe("player town progress", () => {
  it.each([["Jordan Lee", "JL"], ["Jordan Morgan Lee", "JL"], ["Jordan", "J"]])("uses first and last initials for %s", (name, initials) => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const state = {
      wallet: { level: 1, level_name: "Homestead", xp: 25 },
      progression: { next_level_xp: 100, progress_percent: 25 },
    } as GameState;
    client.setQueryData(["game-state"], state);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/town"]}>
      <AppShell user={{ id: "demo-player", display_name: name }} />
    </MemoryRouter></QueryClientProvider>);
    const player = screen.getByLabelText("Demo session");
    expect(within(player).getByText(initials)).toHaveClass("avatar");
    expect(within(player).getByLabelText("Town level progress")).toHaveTextContent("LEVEL 1 · HOMESTEAD");
    expect(within(player).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  });

  it("updates the relocated XP panel when confirmed game state changes", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const state = { wallet: { level: 1, level_name: "Homestead", xp: 0 }, progression: { next_level_xp: 100, progress_percent: 0 } } as GameState;
    client.setQueryData(["game-state"], state);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/town"]}>
      <AppShell user={{ id: "demo-player", display_name: "Jordan Lee" }} />
    </MemoryRouter></QueryClientProvider>);
    await act(async () => { client.setQueryData(["game-state"], { ...state, wallet: { level: 2, level_name: "Village", xp: 150 }, progression: { next_level_xp: 300, progress_percent: 25 } }); });
    expect(await screen.findByText("LEVEL 2 · VILLAGE")).toBeInTheDocument();
    expect(screen.getByText("150 / 300 XP")).toBeInTheDocument();
  });
});
