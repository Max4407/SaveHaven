// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../src/App";

describe("application routes", () => {
  it("shows money history and savings goals on the dashboard", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Your money, at a glance." })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Money over time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New bike" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Emergency fund" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekend trip" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Laptop upgrade" })).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Town" })).toHaveAttribute("href", "/town");
    expect(screen.getByRole("link", { name: "Bank & goals" })).toHaveAttribute("href", "/dashboard");
  });
});
