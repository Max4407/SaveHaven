import { useEffect } from "react";

/** Stays mounted across route changes, so Back and Enter Town clicks finish playing. */
export function ButtonSounds() {
  useEffect(() => {
    const sound = new Audio("/audio/button-click.wav");
    sound.preload = "auto";
    sound.volume = .25;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest('button, a[href], [role="button"], input[type="button"], input[type="submit"], input[type="reset"]');
      if (!control || control.matches(':disabled, [aria-disabled="true"]') || control.closest('[inert]')) return;
      // This is UI feedback, independent of the background-music mute preference.
      sound.currentTime = 0;
      void sound.play().catch(() => { /* Sound failure must never interrupt the button action. */ });
    };
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); sound.pause(); };
  }, []);
  return null;
}
