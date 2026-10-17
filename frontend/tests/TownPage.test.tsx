// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import TownPage from "../src/features/town/TownPage";
import { BUILDING_DRAG_TYPE, buildingCatalog } from "../src/features/town/catalog/buildingCatalog";

vi.mock("../src/features/town/TownCanvas", () => ({
  TownCanvas: () => <div data-testid="town-canvas" />,
}));

afterEach(cleanup);

describe("town layout", () => {
  const renderTown = () => render(<MemoryRouter><TownPage /></MemoryRouter>);

  it("keeps town information in a permanent sidebar beside the map", () => {
    renderTown();

    expect(screen.getByTestId("town-canvas")).toBeInTheDocument();

    const sidebar = screen.getByLabelText("Building catalog");
    expect(within(sidebar).getByText("Buildings")).toBeInTheDocument();
    expect(within(sidebar).getByText("Coins")).toBeInTheDocument();
    expect(within(sidebar).getByText("Preview mode")).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Open bank and goals" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByRole("button", { name: /town sidebar/i })).not.toBeInTheDocument();
  });

  it("makes catalog buildings available to drag onto the map", () => {
    const setData = vi.fn();
    renderTown();

    const bakery = screen.getByLabelText("Mossy bakery building");
    expect(bakery).toHaveAttribute("draggable", "true");

    fireEvent.dragStart(bakery, {
      dataTransfer: { effectAllowed: "none", setData },
    });

    expect(setData).toHaveBeenCalledWith(BUILDING_DRAG_TYPE, "mossy-bakery");
    expect(setData).toHaveBeenCalledWith("text/plain", "mossy-bakery");
  });

  it("uses readable, data-driven map sizes for each building", () => {
    const bakery = buildingCatalog.find((building) => building.id === "mossy-bakery");
    const townhouse = buildingCatalog.find((building) => building.id === "townhouse");
    const well = buildingCatalog.find((building) => building.id === "village-well");

    expect(bakery?.worldWidth).toBeGreaterThan(townhouse?.worldWidth ?? 0);
    expect(townhouse?.worldWidth).toBeGreaterThan(well?.worldWidth ?? 0);
    expect(well?.worldWidth).toBeGreaterThan(96);
  });
});
