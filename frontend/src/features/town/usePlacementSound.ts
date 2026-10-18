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
    const audio = effect.current;
    if (!audio) return;
    audio.currentTime = 0;
    // The source is trimmed to one audible hit, with no leading silence.
    void audio.play().catch(() => { /* Audio failure must never undo a successful placement. */ });
  }, []);
}
