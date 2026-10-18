import { useCallback, useEffect, useRef } from "react";

export function usePlacementSound() {
  const effect = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/audio/building-place.wav");
    audio.preload = "auto";
    audio.volume = .2;
    effect.current = audio;
    return () => {
      audio.pause(); effect.current = null;
    };
  }, []);

  return useCallback(() => {
    try { if (localStorage.getItem("savehaven-town-sound-enabled") === "off") return; }
    catch { /* Sound still works when storage is unavailable. */ }
    const audio = effect.current;
    if (!audio) return;
    audio.currentTime = 0;
    // The source is trimmed to one audible hit, with no leading silence.
    void audio.play().catch(() => { /* Audio failure must never undo a successful placement. */ });
  }, []);
}
