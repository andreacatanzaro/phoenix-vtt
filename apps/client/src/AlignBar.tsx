import { t } from "@phoenix/shared";
import { api } from "./api";
import { gridOf, type AlignState, type AlignStep } from "./table/align";
import { useGuarded } from "./useGuarded";

type Props = {
  worldId: string;
  sceneId: string;
  step: AlignStep;
  onStep: (step: AlignStep) => void;
  state: AlignState;
  preview: boolean;
  onPreview: (on: boolean) => void;
  onCancel: () => void;
  onDone: () => void;
};

const STEPS: readonly AlignStep[] = ["offset", "size", "refine"];

/**
 * The bar of the alignment, at the top in the middle: the three steps, what the grid would be, and apply or give up.
 * Applying saves the size and the offset on the scene; the numbers can still be typed in the scene controls.
 */
export function AlignBar({ worldId, sceneId, step, onStep, state, preview, onPreview, onCancel, onDone }: Props) {
  const guard = useGuarded();
  const grid = gridOf(state);

  const apply = async (): Promise<void> => {
    const ok = await guard.run(async () => {
      await api.updateSceneTable(worldId, sceneId, grid);
    });
    if (ok) onDone();
  };

  return (
    <div className="hud hud-tc align-bar">
      <div className="hud-pill" role="toolbar" aria-label={t("ui.world.table.align.steps")}>
        {STEPS.map((name, index) => (
          <button key={name} type="button" className="btn quiet small" aria-pressed={step === name} onClick={() => { onStep(name); }}>
            {index + 1}. {t(`ui.world.table.align.${name}`)}
          </button>
        ))}
        <label className="switch">
          <input type="checkbox" checked={preview} onChange={(e) => { onPreview(e.target.checked); }} />
          {t("ui.world.table.align.preview")}
        </label>
        <button type="button" className="btn small hero" onClick={() => { void apply(); }}>{t("ui.world.table.align.apply")}</button>
        <button type="button" className="btn quiet small" onClick={onCancel}>{t("ui.world.table.align.cancel")}</button>
      </div>
      <p className="muted small align-hint" role="status">
        {t(`ui.world.table.align.${step}-hint`)} {t("ui.world.table.align.result", { size: String(grid.gridPx), x: String(grid.gridOffsetX), y: String(grid.gridOffsetY) })}
      </p>
      {guard.error !== null && <p className="error" role="alert">{guard.error}</p>}
    </div>
  );
}
