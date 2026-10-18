import { useEffect, useRef, useState } from "react";

const SOUND_PREFERENCE = "savehaven-town-sound-enabled";
function savedSoundEnabled() {
  try { return localStorage.getItem(SOUND_PREFERENCE) !== "off"; }
  catch { return true; }
}

export function TownMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [enabled, setEnabled] = useState(savedSoundEnabled);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = .5;
    audio.muted = !enabled;
    const start = () => {
      if (!enabled || !audio.paused) return;
      void audio.play().catch(() => { /* Sound button retries directly from a user gesture. */ });
    };
    const unlock = (event: Event) => {
      if (event.target instanceof Node && buttonRef.current?.contains(event.target)) return;
      start();
    };
    start();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => { audio?.pause(); };
  }, []);

  const soundOff = !enabled || !playing;
  const toggleSound = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = soundOff;
    setEnabled(next);
    audio.volume = .5;
    audio.muted = !next;
    try { localStorage.setItem(SOUND_PREFERENCE, next ? "on" : "off"); }
    catch { /* Sound remains usable without storage. */ }
    if (next) {
      setFailed(false);
      if (audio.error) audio.load();
      // Run play synchronously inside the click so browsers permit audible playback.
      void audio.play().catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "NotAllowedError")) setFailed(true);
      });
    }
  };

  return (
    <div className="town-sound-control">
      <audio ref={audioRef} src="/audio/town-lofi.mp3" loop preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} />
      <button
        ref={buttonRef}
        className={`pixel-sound-button${soundOff ? " muted" : ""}`}
        type="button"
        aria-label={soundOff ? "Turn town sound on" : "Mute town sound"}
        aria-pressed={!soundOff}
        title={soundOff ? "Sound off — click to play" : "Sound on — click to mute"}
        onClick={toggleSound}
      >
        <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
          <path d="M3 9h4V7h2V5h3v14H9v-2H7v-2H3z" />
          <path d="M15 8h2v2h2v4h-2v2h-2v-2h2v-4h-2zM18 4h2v2h2v3h1v6h-1v3h-2v2h-2v-2h2v-3h1V9h-1V6h-2z" />
          {soundOff ? <path className="sound-red-slash" d="M3 2h3v3h3v3h3v3h3v3h3v3h3v4h-3v-3h-3v-3h-3v-3H9V9H6V6H3z" /> : null}
        </svg>
      </button>
      {failed ? <span className="town-sound-error" role="status">Couldn’t play audio. Click sound to retry.</span> : null}
    </div>
  );
}
