import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ButtonSounds } from "../src/components/ButtonSounds";
import { usePlacementSound } from "../src/features/town/usePlacementSound";

function mockAudio() {
  const sound = { preload: "", volume: 1, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
  vi.stubGlobal("Audio", vi.fn(function () { return sound; }));
  return sound;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

function PlacementHarness() {
  const play = usePlacementSound();
  return <button type="button" onClick={play}>Confirmed placement</button>;
}

describe("sound effects independent of music", () => {
  it("plays once for buttons, nested icons and navigation links even when music is muted", () => {
    localStorage.setItem("savehaven-town-sound-enabled", "off");
    const sound = mockAudio();
    render(<><ButtonSounds /><button><span>Icon</span></button><a href="#town">Enter Town</a><a href="#bank">Back</a><button disabled>Unavailable</button><p>Ordinary text</p></>);
    fireEvent.click(screen.getByText("Icon"));
    fireEvent.click(screen.getByText("Enter Town"));
    fireEvent.click(screen.getByText("Back"));
    expect(sound.play).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByText("Unavailable"));
    fireEvent.click(screen.getByText("Ordinary text"));
    expect(sound.play).toHaveBeenCalledTimes(3);
  });
  it("keeps placement effects audible with music muted, and releases audio on leaving Town", () => {
    localStorage.setItem("savehaven-town-sound-enabled", "off");
    const sound = mockAudio();
    const { unmount } = render(<PlacementHarness />);
    expect(sound.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirmed placement"));
    expect(sound.play).toHaveBeenCalledOnce(); expect(sound.volume).toBe(.2);
    unmount(); expect(sound.pause).toHaveBeenCalled();
  });
  it("removes the global listener on unmount", () => {
    const sound = mockAudio();
    const { unmount } = render(<ButtonSounds />);
    unmount();
    const button = document.createElement("button"); document.body.append(button);
    fireEvent.click(button); button.remove();
    expect(sound.play).not.toHaveBeenCalled();
  });
});
