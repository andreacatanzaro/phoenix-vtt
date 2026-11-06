import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { t, type ElementCollection } from "@phoenix/shared";
import { Icon } from "../Icons";
import type { Point, View } from "../table/geometry";
import { edgeLine, fitPoints, GROUP_RADIUS, SCENE_RADIUS, zoomAround } from "./layout";

export type GraphNode = {
  id: string;
  label: string;
  /** A group (a region, an area, a place) holds others and is gone into; a scene is a leaf. */
  shape: "group" | "scene";
  level: ElementCollection;
  at: Point;
  /** What a group holds. */
  count?: number;
  selected: boolean;
  /** Not shown to the players yet. */
  hidden?: boolean;
  /** It could be placed on a map that exists and is not. */
  waiting?: boolean;
  imageSrc?: string | null;
};
export type GraphEdge = { id: string; from: string; to: string; label: string };

export type GraphCanvasProps = {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  /** The DM: nodes can be moved and scenes linked. */
  canEdit: boolean;
  /** The group being shown: when it changes, the whole of it is brought into view again. */
  fitKey: string;
  /** Pixels on the right that something floats over (the details): a node picked there is moved out from under it. */
  clearRight?: number;
  /** Said when there are no nodes. */
  empty?: string;
  onSelect: (id: string | null) => void;
  onEnter: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onEdge: (id: string) => void;
  onConnect: (fromId: string, toId: string) => void;
};

/** A touch that moves less than this many pixels is a click and not a drag. */
const CLICK_SLOP = 4;
const ZOOM_STEP = 1.25;
const WHEEL_STEP = 0.0015;
const radiusOf = (node: GraphNode): number => (node.shape === "group" ? GROUP_RADIUS : SCENE_RADIUS);

type NodeDrag = { id: string; from: Point; origin: Point; moved: boolean };
type Pan = { from: Point; view: View; moved: boolean };

/**
 * The graph of the structure of a world, in the way of a story builder: round nodes over a night sky, groups that are gone
 * into, scenes joined by lines. It moves like a map (drag the sky, wheel to zoom), the DM drags the nodes and joins scenes.
 * The nodes are buttons with a name, so everything can be picked without the mouse.
 */
export function GraphCanvas({ nodes, edges, canEdit, fitKey, clearRight = 0, empty, onSelect, onEnter, onMove, onEdge, onConnect }: GraphCanvasProps) {
  const sky = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ zoom: 1, panX: 500, panY: 300 });
  const [locked, setLocked] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [live, setLive] = useState<{ id: string; at: Point } | null>(null);
  // Where the node being dragged is: kept in a ref too, since pointer events can come faster than the screen is drawn.
  const liveRef = useRef<{ id: string; at: Point } | null>(null);
  const drag = useRef<NodeDrag | null>(null);
  const pan = useRef<Pan | null>(null);
  // A drag that ends over its own node is followed by a click, which must not pick or link anything.
  const dragged = useRef(false);
  const latest = useRef({ nodes, view });
  latest.current = { nodes, view };

  const screen = (): { w: number; h: number } => {
    const r = sky.current?.getBoundingClientRect();
    return r !== undefined && r.width > 0 && r.height > 0 ? { w: r.width, h: r.height } : { w: 1000, h: 600 };
  };
  // The size the canvas last had: when the room changes, the view moves by half of the change, and no more than once.
  const lastSize = useRef<{ w: number; h: number } | null>(null);
  const fit = (): void => {
    const size = screen();
    lastSize.current = size;
    setView(fitPoints(latest.current.nodes.map((n) => n.at), size));
  };
  useLayoutEffect(() => {
    fit();
    setLinkFrom(null);
  }, [fitKey]);

  // The wheel zooms around the pointer; it has to be a listener that may stop the page from scrolling.
  useEffect(() => {
    const element = sky.current;
    if (element === null) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const box = element.getBoundingClientRect();
      setView((v) => zoomAround(v, Math.exp(-e.deltaY * WHEEL_STEP), { x: e.clientX - box.left, y: e.clientY - box.top }));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => { element.removeEventListener("wheel", onWheel); };
  }, []);

  // When the room it has changes (the details open or close beside it), the node that was picked stays where it is on the
  // screen (the second click of a double click must still find it), unless it would fall outside: then it is brought back.
  // With nothing picked, what is in the middle stays in the middle.
  useEffect(() => {
    const element = sky.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    lastSize.current ??= screen();
    const observer = new ResizeObserver(() => {
      const now = screen();
      const before = lastSize.current ?? now;
      lastSize.current = now;
      const shift = (v: View): Point => {
        const chosen = latest.current.nodes.find((n) => n.selected);
        if (chosen === undefined) return { x: (now.w - before.w) / 2, y: (now.h - before.h) / 2 };
        const margin = radiusOf(chosen) * v.zoom + 12;
        const x = chosen.at.x * v.zoom + v.panX;
        const y = chosen.at.y * v.zoom + v.panY;
        const inside = (n: number, size: number): number => Math.max(Math.min(n, size - margin), margin);
        return { x: inside(x, now.w) - x, y: inside(y, now.h) - y };
      };
      setView((v) => {
        const d = shift(v);
        return d.x === 0 && d.y === 0 ? v : { ...v, panX: v.panX + d.x, panY: v.panY + d.y };
      });
    });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);

  // A node picked under the strip something floats over is brought out from under it, with room for the button under the node.
  const pickedId = nodes.find((n) => n.selected)?.id;
  useLayoutEffect(() => {
    if (pickedId === undefined || clearRight <= 0) return;
    const chosen = latest.current.nodes.find((n) => n.id === pickedId);
    if (chosen === undefined) return;
    const size = screen();
    setView((v) => {
      const margin = radiusOf(chosen) * v.zoom + 12;
      const limit = size.w - clearRight;
      if (limit < margin * 2) return v;
      const x = chosen.at.x * v.zoom + v.panX;
      return x + margin <= limit ? v : { ...v, panX: v.panX - (x + margin - limit) };
    });
  }, [pickedId, clearRight]);

  useEffect(() => {
    if (linkFrom === null) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setLinkFrom(null); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [linkFrom]);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const box = sky.current?.getBoundingClientRect();
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) };
  };
  const place = (node: GraphNode): Point => (live?.id === node.id ? live.at : node.at);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  /** A node is picked; while an exit is being made, the node picked is its other end. */
  const activate = (node: GraphNode): void => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (linkFrom !== null) {
      if (node.shape === "scene" && node.id !== linkFrom) onConnect(linkFrom, node.id);
      setLinkFrom(null);
      return;
    }
    onSelect(node.id);
  };

  const startNode = (e: ReactPointerEvent<HTMLButtonElement>, node: GraphNode): void => {
    e.stopPropagation();
    dragged.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer that cannot be captured is still followed while it is over the node */ }
    drag.current = { id: node.id, from: { x: e.clientX, y: e.clientY }, origin: node.at, moved: false };
  };
  const moveNode = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const d = drag.current;
    if (d === null) return;
    const dx = e.clientX - d.from.x;
    const dy = e.clientY - d.from.y;
    if (!d.moved && Math.hypot(dx, dy) <= CLICK_SLOP) return;
    d.moved = true;
    if (!canEdit || locked) return;
    const zoom = latest.current.view.zoom;
    const next = { id: d.id, at: { x: d.origin.x + dx / zoom, y: d.origin.y + dy / zoom } };
    liveRef.current = next;
    setLive(next);
  };
  const endNode = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    const d = drag.current;
    drag.current = null;
    if (d === null || !d.moved) return;
    dragged.current = true;
    const to = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (canEdit && !locked && to?.id === d.id) onMove(d.id, to.at.x, to.at.y);
  };

  const startPan = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget && !(e.target instanceof Element && e.target.closest(".graph-world") !== null && !e.target.closest("button"))) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* as above */ }
    pan.current = { from: local(e), view, moved: false };
  };
  const movePan = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const p = pan.current;
    if (p === null) return;
    const now = local(e);
    if (!p.moved && Math.hypot(now.x - p.from.x, now.y - p.from.y) <= CLICK_SLOP) return;
    p.moved = true;
    setView({ ...p.view, panX: p.view.panX + now.x - p.from.x, panY: p.view.panY + now.y - p.from.y });
  };
  const endPan = (): void => {
    const p = pan.current;
    pan.current = null;
    if (p?.moved === true) dragged.current = true;
  };

  const zoomBy = (factor: number): void => {
    const s = screen();
    setView((v) => zoomAround(v, factor, { x: s.w / 2, y: s.h / 2 }));
  };

  const picked = nodes.find((n) => n.selected);
  const at = (node: GraphNode): Point => {
    const p = place(node);
    return { x: p.x * view.zoom + view.panX, y: (p.y + radiusOf(node)) * view.zoom + view.panY };
  };

  return (
    <div
      ref={sky}
      className="graph-sky"
      data-testid="graph-sky"
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onClick={(e) => {
        if (e.target !== e.currentTarget && !(e.target instanceof Element && e.target.classList.contains("graph-world"))) return;
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        setLinkFrom(null);
        onSelect(null);
      }}
    >
      <div className="graph-world" data-testid="graph-world" data-zoom={String(view.zoom)} style={{ transform: `translate(${String(view.panX)}px, ${String(view.panY)}px) scale(${String(view.zoom)})` }}>
        <svg className="graph-edges" width="1" height="1">
          {edges.map((edge) => {
            const a = byId.get(edge.from);
            const b = byId.get(edge.to);
            if (a === undefined || b === undefined) return null;
            const line = edgeLine(place(a), place(b), radiusOf(a), radiusOf(b));
            return line === null ? null : <line key={edge.id} className="graph-edge" {...line} />;
          })}
        </svg>
        {edges.map((edge) => {
          const a = byId.get(edge.from);
          const b = byId.get(edge.to);
          if (a === undefined || b === undefined || edgeLine(place(a), place(b), radiusOf(a), radiusOf(b)) === null) return null;
          const pa = place(a);
          const pb = place(b);
          return (
            <button key={edge.id} type="button" className="graph-link" style={{ left: (pa.x + pb.x) / 2, top: (pa.y + pb.y) / 2 }} aria-label={edge.label} onClick={() => { onEdge(edge.id); }} onPointerDown={(e) => { e.stopPropagation(); }}>
              <Icon name="link" />
            </button>
          );
        })}
        {nodes.map((node) => {
          const r = radiusOf(node);
          const p = place(node);
          const classes = ["graph-node", node.shape, node.level, node.selected ? "selected" : "", node.hidden === true ? "hidden" : "", linkFrom === node.id ? "linking" : ""].filter((c) => c !== "").join(" ");
          return (
            <button
              key={node.id}
              type="button"
              className={classes}
              style={{ left: p.x - r, top: p.y - r, width: r * 2, height: r * 2 }}
              aria-label={node.label}
              aria-pressed={node.selected}
              onPointerDown={(e) => { startNode(e, node); }}
              onPointerMove={moveNode}
              onPointerUp={endNode}
              onClick={(e) => { e.stopPropagation(); activate(node); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                activate(node);
              }}
              onDoubleClick={() => { if (node.shape === "group") onEnter(node.id); }}
            >
              <span className="graph-disc">
                {node.imageSrc != null ? <img className="graph-picture" src={node.imageSrc} alt="" draggable={false} /> : node.shape === "scene" ? <Icon name="pin" /> : <span className="graph-initial" aria-hidden="true">{node.label.trim().charAt(0).toUpperCase()}</span>}
              </span>
              {node.shape === "group" && (
                <span className="graph-badge">
                  {t(`ui.world.kind.${node.level}`)}
                  {node.count !== undefined && <span className="graph-count">{node.count}</span>}
                </span>
              )}
              {node.waiting === true && <span className="graph-waiting">{t("ui.world.graph.waiting")}</span>}
              <span className="graph-name">{node.label}</span>
            </button>
          );
        })}
      </div>

      {picked !== undefined && linkFrom === null && (picked.shape === "group" || canEdit) && (
        <div className="graph-actions" style={{ left: at(picked).x, top: at(picked).y + 10 }}>
          {picked.shape === "group" && (
            <button type="button" className="graph-act" aria-label={t("ui.world.graph.enter")} data-tip={t("ui.world.graph.enter")} onClick={() => { onEnter(picked.id); }}>
              <Icon name="enter" />
            </button>
          )}
          {picked.shape === "scene" && canEdit && (
            <button type="button" className="graph-act" aria-label={t("ui.world.graph.connect")} data-tip={t("ui.world.graph.connect")} onClick={() => { setLinkFrom(picked.id); }}>
              <Icon name="link" />
            </button>
          )}
        </div>
      )}
      {linkFrom !== null && <p className="graph-hint notice" role="status">{t("ui.world.graph.connect-hint")}</p>}
      {nodes.length === 0 && empty !== undefined && <p className="graph-empty">{empty}</p>}

      <div className="graph-tools hud-pill" role="toolbar" aria-label={t("ui.world.graph.view")} onPointerDown={(e) => { e.stopPropagation(); }}>
        {canEdit && (
          <button type="button" className="hud-btn" aria-pressed={locked} aria-label={t("ui.world.graph.lock")} data-tip={t("ui.world.graph.lock")} onClick={() => { setLocked((l) => !l); }}>
            <Icon name={locked ? "lock" : "unlock"} />
          </button>
        )}
        <button type="button" className="hud-btn" aria-label={t("ui.world.graph.fit")} data-tip={t("ui.world.graph.fit")} onClick={fit}>
          <Icon name="fit" />
        </button>
        <button type="button" className="hud-btn" aria-label={t("ui.world.graph.zoom-out")} data-tip={t("ui.world.graph.zoom-out")} onClick={() => { zoomBy(1 / ZOOM_STEP); }}>
          <Icon name="minus" />
        </button>
        <span className="graph-zoom">{Math.round(view.zoom * 100)}%</span>
        <button type="button" className="hud-btn" aria-label={t("ui.world.graph.zoom-in")} data-tip={t("ui.world.graph.zoom-in")} onClick={() => { zoomBy(ZOOM_STEP); }}>
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}
