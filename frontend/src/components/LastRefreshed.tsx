import { useEffect, useState } from "react";

export function LastRefreshed({ timestamp }: { timestamp: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // SQLite can return UTC timestamps without an explicit timezone.
  const normalizedTimestamp = timestamp && !/(Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)
    ? `${timestamp}Z`
    : timestamp;
  const refreshedAt = normalizedTimestamp ? Date.parse(normalizedTimestamp) : NaN;
  if (!Number.isFinite(refreshedAt)) {
    return <span className="last-refreshed">Not refreshed yet</span>;
  }

  const seconds = Math.max(0, Math.floor((now - refreshedAt) / 1000));
  const units = seconds >= 86400 ? [Math.floor(seconds / 86400), "day"] as const
    : seconds >= 3600 ? [Math.floor(seconds / 3600), "hour"] as const
    : seconds >= 60 ? [Math.floor(seconds / 60), "minute"] as const
    : [seconds, "second"] as const;
  const label = seconds === 0 ? "just now" : `${units[0]} ${units[1]}${units[0] === 1 ? "" : "s"} ago`;

  return <time className="last-refreshed" dateTime={normalizedTimestamp!} title={new Date(refreshedAt).toLocaleString()}>Last refreshed {label}</time>;
}
