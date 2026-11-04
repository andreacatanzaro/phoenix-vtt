import { t } from "@phoenix/shared";
import { Icon, type IconName } from "./Icons";
import { TOOL_KEYS, type Tool } from "./table/tools";

const ICONS: Record<Tool, IconName> = { move: "move", select: "select", measure: "measure", pointer: "pointer", text: "text" };

type Props = {
  tools: readonly Tool[];
  tool: Tool;
  onTool: (tool: Tool) => void;
  collapsed: boolean;
  onCollapse: () => void;
};

/** The tools down the right edge, each with its key, as on Owlbear Rodeo. The arrow above folds the column away. */
export function ToolColumn({ tools, tool, onTool, collapsed, onCollapse }: Props) {
  return (
    <div className="hud hud-tr">
      <button type="button" className="hud-btn round" aria-label={t("ui.world.table.toolbar.toggle")} aria-expanded={!collapsed} onClick={onCollapse}>
        <span className={collapsed ? "turn" : undefined}>
          <Icon name="chevron" />
        </span>
      </button>
      {!collapsed && (
        <div className="hud-pill column" role="toolbar" aria-orientation="vertical" aria-label={t("ui.world.table.toolbar.label")}>
          {tools.map((name) => (
            <button key={name} type="button" className="hud-btn" aria-pressed={tool === name} data-tip={`${t(`ui.world.table.toolbar.${name}`)} (${TOOL_KEYS[name].toUpperCase()})`} aria-label={t(`ui.world.table.toolbar.${name}`)} onClick={() => { onTool(name); }}>
              <Icon name={ICONS[name]} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
