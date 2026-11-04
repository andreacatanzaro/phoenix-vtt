import { useEffect, useState } from "react";
import { t, type SessionView } from "@phoenix/shared";
import { api } from "./api";
import { TablePage } from "./TablePage";
import { useGuarded } from "./useGuarded";

/** The "Tavolo" tab: sit down when a session is running, otherwise say why there is nothing to do. */
export function TablePanel({ worldId, seated, onSeated }: { worldId: string; seated: boolean; onSeated: (seated: boolean) => void }) {
  const [running, setRunning] = useState<SessionView | null | undefined>(undefined);
  const guard = useGuarded();

  useEffect(() => {
    let live = true;
    void guard.run(async () => {
      const sessions = await api.sessions(worldId);
      if (live) setRunning(sessions.find((s) => s.status === "running") ?? null);
    });
    return () => { live = false; };
  }, [worldId]);

  if (seated) return <TablePage worldId={worldId} onLeave={() => { onSeated(false); }} />;
  if (guard.error !== null) return <p className="error" role="alert">{guard.error}</p>;
  if (running === undefined) return <p className="muted" role="status">{t("ui.loading")}</p>;
  if (running === null) return <p className="muted centered">{t("ui.world.table.none")}</p>;
  return (
    <div className="panel framed centered stack">
      <p className="flavor">{t("ui.world.table.running", { title: running.title })}</p>
      <button type="button" className="btn hero" onClick={() => { onSeated(true); }}>{t("ui.world.table.enter")}</button>
    </div>
  );
}
