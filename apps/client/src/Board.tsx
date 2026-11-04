import { useEffect, useRef } from "react";
import { t, type TableScene, type TokenView } from "@phoenix/shared";
import { imageUrl } from "./api";
import { BoardView } from "./table/board-view";

export type BoardMe = { accountId: string; role: "dm" | "player" };

type Props = {
  worldId: string;
  scene: TableScene;
  tokens: readonly TokenView[];
  me: BoardMe;
  selectedId: string | null;
  showStart: boolean;
  revision: number;
  onSelect: (tokenId: string | null) => void;
  onMove: (tokenId: string, x: number, y: number) => void;
};

/** The canvas of the table. The drawing lives in `BoardView`; this only hands it the state and what to do on a touch. */
export function Board(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<BoardView | null>(null);
  const latest = useRef(props);
  latest.current = props;

  const draw = (board: BoardView): void => {
    const p = latest.current;
    board.update({ scene: p.scene, tokens: p.tokens, me: p.me, selectedId: p.selectedId, showStart: p.showStart, revision: p.revision, imageUrl: (id) => imageUrl(p.worldId, id) });
  };

  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    let cancelled = false;
    void BoardView.create(element, {
      onSelect: (id) => { latest.current.onSelect(id); },
      onMove: (id, x, y) => { latest.current.onMove(id, x, y); },
    }).then((board) => {
      if (cancelled) {
        board.destroy();
        return;
      }
      view.current = board;
      draw(board);
    });
    return () => {
      cancelled = true;
      view.current?.destroy();
      view.current = null;
    };
    // The board is created once; later changes go through `update`.
  }, []);

  useEffect(() => {
    if (view.current !== null) draw(view.current);
  });

  return <div className="board" ref={host} role="application" aria-label={t("ui.world.table.board")} />;
}
