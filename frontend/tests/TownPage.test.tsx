// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TownPage from "../src/features/town/TownPage";

vi.mock("../src/features/town/TownCanvas", () => ({
  TownCanvas: () => <div data-testid="town-canvas" />,
}));

describe("town layout", () => {
  it("keeps town information in a collapsible sidebar beside the map", () => {
    render(<TownPage />);

    expect(screen.getByTestId("town-canvas")).toBeInTheDocument();

    const sidebar = screen.getByLabelText("Building catalog");
    expect(sidebar).toHaveClass("open");
    expect(within(sidebar).getByText("Riverside Valley")).toBeInTheDocument();
    expect(within(sidebar).getByText("Coins")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse town sidebar" }));

    expect(screen.getByRole("button", { name: "Open town sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(sidebar).not.toHaveClass("open");
  });
});
