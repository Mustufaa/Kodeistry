"use client";

import { useId } from "react";
import { usePreferences, type Preferences } from "./preferences-provider";

export function PreferenceToggle({ preference, title, description }: {
  preference: keyof Preferences;
  title: string;
  description: string;
}) {
  const id = useId();
  const { preferences, setPreference } = usePreferences();
  return (
    <div className="flex items-start justify-between gap-5 py-5">
      <div><label htmlFor={id} className="cursor-pointer text-sm font-medium">{title}</label><p id={id + "-description"} className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
      <input id={id} type="checkbox" role="switch" aria-describedby={id + "-description"} checked={preferences[preference]} onChange={(event) => setPreference(preference, event.target.checked)} className="mt-1 size-5 shrink-0 cursor-pointer accent-violet-600" />
    </div>
  );
}
