import { useState } from "react";
import { errorText } from "./messages";

/** Runs an action and keeps the Italian text of its error, if it fails; the next run clears it. */
export function useGuarded(): { error: string | null; run: (action: () => Promise<void>) => Promise<boolean> } {
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    async run(action) {
      setError(null);
      try {
        await action();
        return true;
      } catch (e) {
        setError(errorText(e));
        return false;
      }
    },
  };
}
