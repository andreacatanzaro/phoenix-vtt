import { useEffect, useImperativeHandle, useRef, type KeyboardEvent, type Ref } from "react";
import { t, type TableScene, type TokenView } from "@phoenix/shared";
import { imageUrl } from "./api";
import { BoardView, type BoardCallbacks, type BoardProps } from "./table/board-view";
import type { Point } from "./table/geometry";
import type { RemotePointer } from "./table/pointers";
import type { MeasureMode, SelectMode, Tool } from "./table/tools";

export type BoardMe = { accountId: string; role: "dm" | "player" };

/** What the screen can ask of the board directly. */
export type BoardHandle = {
  getView: () => { x: number; y: number; zoom: number } | null;
  setView: (center: Point, zoom: number) => void;
  /** Moves the view by this many screen pixels. */
  nudge: (dx: number, dy: number) => void;
  /** Zooms by this factor around the middle of the screen. */
  zoomBy: (factor: number) => void;
};

/** How far an arrow key moves the view, and how much a zoom key zooms. */
export const KEY_PAN_PX = 80;
export const KEY_ZOOM = 1.2;

type Props = BoardCallbacks & {
  worldId: string;
  scene: TableScene;
  tokens: readonly TokenView[];
  me: BoardMe;
  selectedIds: ReadonlySet<string>;
  tool: Tool;
  selectMode: SelectMode;
  measureMode: MeasureMode;
  showStart: boolean;
  revision: number;
  pointers: ReadonlyMap<string, RemotePointer>;
  viewRequest: { x: number; y: number; zoom: number; seq: number } | null;
  resetViewSeq: number;
  align: BoardProps["align"];
  ref?: Ref<BoardHandle>;
};

/** The canvas of the table, the size of the whole screen. The drawing lives in `BoardView`; this hands it the state. */
export function Board(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<BoardView | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(props.ref, () => ({
    getView: () => view.current?.getView() ?? null,
    setView: (center, zoom) => { view.current?.setView(center, zoom); },
    nudge: (dx, dy) => { view.current?.nudge(dx, dy); },
    zoomBy: (factor) => { view.current?.zoomBy(factor); },
  }));

  /** The view can be moved without a mouse: arrows move it, plus and minus zoom. Tokens are picked from the list. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [KEY_PAN_PX, 0], ArrowRight: [-KEY_PAN_PX, 0], ArrowUp: [0, KEY_PAN_PX], ArrowDown: [0, -KEY_PAN_PX] };
    const move = moves[e.key];
    if (move !== undefined) {
      e.preventDefault();
      view.current?.nudge(move[0], move[1]);
    } else if (e.key === "+" || e.key === "=" || e.code === "Equal" || e.code === "NumpadAdd") {
      e.preventDefault();
      view.current?.zoomBy(KEY_ZOOM);
    } else if (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract") {
      e.preventDefault();
      view.current?.zoomBy(1 / KEY_ZOOM);
    }
  };

  const draw = (board: BoardView): void => {
    const p = latest.current;
    board.update({
      scene: p.scene,
      tokens: p.tokens,
      me: p.me,
      selectedIds: p.selectedIds,
      tool: p.tool,
      selectMode: p.selectMode,
      measureMode: p.measureMode,
      showStart: p.showStart,
      revision: p.revision,
      pointers: p.pointers,
      viewRequest: p.viewRequest,
      resetViewSeq: p.resetViewSeq,
      align: p.align,
      imageUrl: (id) => imageUrl(p.worldId, id),
    });
  };

  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    let cancelled = false;
    void BoardView.create(element, {
      onSelect: (ids) => { latest.current.onSelect(ids); },
      onMove: (moves) => { latest.current.onMove(moves); },
      onPointer: (x, y) => { latest.current.onPointer(x, y); },
      onPlaceText: (cell, at) => { latest.current.onPlaceText(cell, at); },
      onView: (v) => { latest.current.onView(v); },
      onAnchor: (at) => { latest.current.onAnchor(at); },
      onAlign: (state) => { latest.current.onAlign(state); },
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

  return (
    <>
      <div className="board" ref={host} role="application" tabIndex={0} aria-label={t("ui.world.table.board")} aria-describedby="board-help" onKeyDown={onKeyDown} />
      <p id="board-help" className="sr-only">{t("ui.world.table.board-help")}</p>
    </>
  );
}
