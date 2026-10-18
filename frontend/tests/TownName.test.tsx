import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { TownName } from "../src/features/town/TownName";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("saves a trimmed town name across reloads without changing another profile's town", () => {
  const view = render(<TownName userId="jordan" />);
  fireEvent.click(screen.getByRole("button", { name: "Rename town" }));
  fireEvent.change(screen.getByLabelText("Town name"), { target: { value: "  Cedar Grove  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  expect(screen.getByRole("heading", { name: "Cedar Grove" })).toBeInTheDocument();
  view.unmount();
  const reloaded = render(<TownName userId="jordan" />);
  expect(screen.getByRole("heading", { name: "Cedar Grove" })).toBeInTheDocument();
  reloaded.unmount();
  render(<TownName userId="another-player" />);
  expect(screen.getByRole("heading", { name: "Your future haven" })).toBeInTheDocument();
});

it("rejects blank names and lets Escape cancel without changing the saved name", () => {
  render(<TownName userId="jordan" />);
  fireEvent.click(screen.getByRole("button", { name: "Rename town" }));
  const input = screen.getByLabelText("Town name");
  expect(input).toHaveAttribute("maxLength", "40");
  fireEvent.change(input, { target: { value: "   " } });
  expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "Unsaved name" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.getByRole("heading", { name: "Your future haven" })).toBeInTheDocument();
  expect(localStorage.getItem("savehaven-town-name:jordan")).toBeNull();
});
