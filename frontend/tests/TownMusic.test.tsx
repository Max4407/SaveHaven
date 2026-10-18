import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TownMusic } from "../src/features/town/TownMusic";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: true });
    this.dispatchEvent(new Event("pause"));
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("Town soundtrack", () => {
  it("plays the supplied MP3 with one pixel mute control and stops on leaving Town", () => {
    localStorage.setItem("savehaven-town-volume", "0");
    const { container, unmount } = render(<TownMusic />);
    const audio = container.querySelector("audio")!;
    expect(audio).toHaveAttribute("src", "/audio/town-lofi.mp3");
    expect(audio).toHaveAttribute("loop");
    expect(audio.volume).toBe(.5);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Mute town music" }));
    expect(audio.muted).toBe(true);
    expect(container.querySelector(".sound-red-slash")).toBeInTheDocument();
    expect(localStorage.getItem("savehaven-town-sound-enabled")).toBe("off");
    fireEvent.click(screen.getByRole("button", { name: "Play town music" }));
    expect(audio.muted).toBe(false);
    expect(container.querySelector(".sound-red-slash")).toBeNull();
    unmount(); expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
  it("starts directly from the button after autoplay is blocked", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));
    render(<TownMusic />);
    fireEvent.click(screen.getByRole("button", { name: "Play town music" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mute town music" })).toBeInTheDocument());
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });
  it("honors a saved mute preference until the speaker button is pressed", () => {
    localStorage.setItem("savehaven-town-sound-enabled", "off");
    render(<TownMusic />);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play town music" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});
