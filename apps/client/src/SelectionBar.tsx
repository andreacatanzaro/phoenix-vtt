import { t, type TableCommand, type TokenView } from "@phoenix/shared";
import { Icon } from "./Icons";
import { duplicateSpot, type Point } from "./table/geometry";

type Props = {
  /** The selected tokens, still on the board. */
  selected: readonly TokenView[];
  isDm: boolean;
  /** Where on the screen to put the bar: right under the selection. */
  at: Point;
  send: (command: TableCommand) => boolean;
  onMore: () => void;
};

/** The actions on what is selected, in a bar that sits under it. A player only has "more", for the token that is theirs. */
export function SelectionBar({ selected, isDm, at, send, onMore }: Props) {
  if (selected.length === 0) return null;
  const allHidden = selected.every((tk) => tk.hidden);
  const toggleHidden = (): void => {
    for (const tk of selected) send({ type: "token.update", tokenId: tk.id, hidden: !allHidden });
  };
  const duplicate = (): void => {
    for (const tk of selected) {
      // The copy is one square over, and belongs to nobody: it is a new token, not another player's character.
      const spot = duplicateSpot(tk.x, tk.y);
      send({ type: "token.add", kind: tk.kind, label: tk.label, color: tk.color, x: spot.x, y: spot.y, size: tk.size, hidden: tk.hidden, travels: tk.travels, ownerAccountId: null, imageId: tk.imageId });
    }
  };
  const remove = (): void => {
    for (const tk of selected) send({ type: "token.remove", tokenId: tk.id });
  };
  return (
    <div className="sel-bar hud-pill" role="toolbar" aria-label={t("ui.world.table.selection.label")} style={{ left: at.x, top: at.y }}>
      {isDm && (
        <>
          <button type="button" className="hud-btn" data-tip={allHidden ? t("ui.world.table.selection.show") : t("ui.world.table.selection.hide")} aria-label={allHidden ? t("ui.world.table.selection.show") : t("ui.world.table.selection.hide")} onClick={toggleHidden}>
            <Icon name={allHidden ? "eye-off" : "eye"} />
          </button>
          <button type="button" className="hud-btn" data-tip={t("ui.world.table.selection.duplicate")} aria-label={t("ui.world.table.selection.duplicate")} onClick={duplicate}>
            <Icon name="copy" />
          </button>
          <button type="button" className="hud-btn danger" data-tip={t("ui.world.table.selection.remove")} aria-label={t("ui.world.table.selection.remove")} onClick={remove}>
            <Icon name="trash" />
          </button>
        </>
      )}
      {selected.length === 1 && (
        <button type="button" className="hud-btn" data-tip={t("ui.world.table.selection.more")} aria-label={t("ui.world.table.selection.more")} onClick={onMore}>
          <Icon name="more" />
        </button>
      )}
      {selected.length > 1 && <span className="muted small count">{t("ui.world.table.selection.count", { count: selected.length })}</span>}
    </div>
  );
}
