import { useEffect, useState } from "react";
import { t, type TableCommand, type TableScene } from "@phoenix/shared";
import { api } from "./api";
import { sceneOptions, type SceneOption } from "./tree";
import { useGuarded } from "./useGuarded";

type Props = {
  worldId: string;
  /** The scene being played, if there is one. */
  scene: TableScene | null;
  send: (command: TableCommand) => boolean;
};

/** The scenes of the world, for the DM: open one, or take everyone there. */
export function ScenesPanel({ worldId, scene, send }: Props) {
  const [options, setOptions] = useState<SceneOption[]>([]);
  const guard = useGuarded();

  useEffect(() => {
    let live = true;
    void guard.run(async () => {
      const tree = await api.tree(worldId);
      if (live) setOptions(sceneOptions(tree));
    });
    return () => { live = false; };
    // The list is read once per world.
  }, [worldId]);

  return (
    <section className="panel hud-panel wide" aria-label={t("ui.world.table.hud.scenes")}>
      <h2 className="section-title">{t("ui.world.table.hud.scenes")}</h2>
      <ul className="scene-list">
        {options.map((o) => (
          <li key={o.id} className={o.id === scene?.id ? "playing" : undefined}>
            <span className="path">{o.path}</span>
            {o.id === scene?.id ? (
              <span className="badge gold">{t("ui.world.table.tools.playing")}</span>
            ) : (
              <span className="row">
                <button type="button" className="btn quiet small" aria-label={`${t("ui.world.table.tools.open")}: ${o.path}`} onClick={() => { send({ type: "scene.open", sceneId: o.id }); }}>
                  {t("ui.world.table.tools.open")}
                </button>
                <button type="button" className="btn small" disabled={scene === null} aria-label={`${t("ui.world.table.tools.travel")}: ${o.path}`} onClick={() => { send({ type: "scene.travel", toSceneId: o.id }); }}>
                  {t("ui.world.table.tools.travel")}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {options.length === 0 && guard.error === null && <p className="muted small">{t("ui.world.table.tools.no-scenes")}</p>}
      <p className="muted small">{t("ui.world.table.tools.travel-hint")}</p>
      {guard.error !== null && <p className="error" role="alert">{guard.error}</p>}
    </section>
  );
}
