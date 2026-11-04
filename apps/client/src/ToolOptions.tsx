import { t } from "@phoenix/shared";
import { Icon } from "./Icons";
import type { MeasureMode, SelectMode, Tool } from "./table/tools";

type Props = {
  tool: Tool;
  selectMode: SelectMode;
  onSelectMode: (mode: SelectMode) => void;
  measureMode: MeasureMode;
  onMeasureMode: (mode: MeasureMode) => void;
};

/** The options of the tool in use, at the top in the middle. Some tools have none, and then there is no bar. */
export function ToolOptions({ tool, selectMode, onSelectMode, measureMode, onMeasureMode }: Props) {
  if (tool === "select") {
    return (
      <div className="hud hud-tc">
        <div className="hud-pill" role="toolbar" aria-label={t("ui.world.table.toolbar.options")}>
          <button type="button" className="hud-btn" aria-pressed={selectMode === "rectangle"} data-tip={t("ui.world.table.toolbar.select-rectangle")} aria-label={t("ui.world.table.toolbar.select-rectangle")} onClick={() => { onSelectMode("rectangle"); }}>
            <Icon name="rectangle" />
          </button>
          <button type="button" className="hud-btn" aria-pressed={selectMode === "lasso"} data-tip={t("ui.world.table.toolbar.select-lasso")} aria-label={t("ui.world.table.toolbar.select-lasso")} onClick={() => { onSelectMode("lasso"); }}>
            <Icon name="lasso" />
          </button>
        </div>
      </div>
    );
  }
  if (tool === "start") {
    return (
      <div className="hud hud-tc">
        <p className="hud-pill muted small" role="status">{t("ui.world.table.toolbar.start-hint")}</p>
      </div>
    );
  }
  if (tool === "measure") {
    return (
      <div className="hud hud-tc">
        <div className="hud-pill" role="toolbar" aria-label={t("ui.world.table.toolbar.options")}>
          <button type="button" className="hud-btn" aria-pressed={measureMode === "ruler"} data-tip={t("ui.world.table.toolbar.measure-ruler")} aria-label={t("ui.world.table.toolbar.measure-ruler")} onClick={() => { onMeasureMode("ruler"); }}>
            <Icon name="ruler" />
          </button>
          <button type="button" className="hud-btn" aria-pressed={measureMode === "radius"} data-tip={t("ui.world.table.toolbar.measure-radius")} aria-label={t("ui.world.table.toolbar.measure-radius")} onClick={() => { onMeasureMode("radius"); }}>
            <Icon name="radius" />
          </button>
        </div>
      </div>
    );
  }
  return null;
}
