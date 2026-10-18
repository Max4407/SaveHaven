import { useState } from "react";

const DEFAULT_NAME = "Your future haven";

export function TownName({ userId }: { userId: string }) {
  const storageKey = `savehaven-town-name:${userId}`;
  const [name, setName] = useState(() => {
    try { return localStorage.getItem(storageKey)?.trim().slice(0, 40) || DEFAULT_NAME; }
    catch { return DEFAULT_NAME; }
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saveError, setSaveError] = useState(false);

  if (!editing) return (
    <div className="town-name">
      <h1>{name}</h1>
      <button className="town-rename-button" type="button" onClick={() => {
        setDraft(name);
        setSaveError(false);
        setEditing(true);
      }}>Rename town</button>
    </div>
  );

  return (
    <form className="town-name-form" onSubmit={(event) => {
      event.preventDefault();
      const nextName = draft.trim();
      if (!nextName) return;
      try {
        localStorage.setItem(storageKey, nextName);
        setName(nextName);
        setEditing(false);
      } catch { setSaveError(true); }
    }}>
      <label htmlFor="town-name">Town name</label>
      <input id="town-name" value={draft} maxLength={40} autoFocus onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); setEditing(false); }
      }} />
      <div>
        <button type="submit" disabled={!draft.trim()}>Save name</button>
        <button type="button" onClick={() => setEditing(false)}>Cancel</button>
      </div>
      {saveError && <p role="alert">Could not save the name in this browser. Please try again.</p>}
    </form>
  );
}
