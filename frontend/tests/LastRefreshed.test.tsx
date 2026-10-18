import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LastRefreshed } from "../src/components/LastRefreshed";

describe("LastRefreshed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T18:00:00Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("ages automatically and resets when a successful refresh supplies a new timestamp", () => {
    const { rerender } = render(<LastRefreshed timestamp="2026-10-17T18:00:00Z" />);
    expect(screen.getByText("Last refreshed just now")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Last refreshed 1 second ago")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByText("Last refreshed 5 seconds ago")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(55000); });
    expect(screen.getByText("Last refreshed 1 minute ago")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3540000); });
    expect(screen.getByText("Last refreshed 1 hour ago")).toBeInTheDocument();
    rerender(<LastRefreshed timestamp="2026-10-17T19:00:00Z" />);
    expect(screen.getByText("Last refreshed just now")).toBeInTheDocument();
  });

  it("treats SQLite timestamps without a timezone as UTC", () => {
    render(<LastRefreshed timestamp="2026-10-17T18:00:00" />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Last refreshed 1 second ago")).toBeInTheDocument();
  });

  it("handles missing timestamps and cleans up the clock on unmount", () => {
    const { unmount } = render(<LastRefreshed timestamp={null} />);
    expect(screen.getByText("Not refreshed yet")).toBeInTheDocument();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
