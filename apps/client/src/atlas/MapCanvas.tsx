import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { MAX_POLYGON_POINTS, pointInPolygon, t, type MapPoint } from "@phoenix/shared";
import { ARROW_SIDE, arrowShape, closesPolygon, polygonAttribute, toMapPoint } from "./map-geometry";

export type MapShape = { id: string; label: string; polygon: readonly MapPoint[]; selected: boolean };
export type MapPin = { id: string; label: string; at: MapPoint; selected: boolean; kind: "place" | "scene" };
/** An exit from one pin to another, drawn as an arrow between them. */
export type MapArrow = { id: string; from: MapPoint; to: MapPoint; label: string; selected: boolean };
/**
 * What a click on the picture does: nothing but pick (view), add a point to a shape (draw), place a pin (pin, inside an area
 * if one is given), pick two pins, the start and the end of an exit (link), or move the points of one shape (edit).
 */
export type MapMode =
  | { kind: "view" }
  | { kind: "draw" }
  | { kind: "pin"; inside?: readonly MapPoint[] | undefined }
  | { kind: "link" }
  | { kind: "edit"; shapeId: string };

export type MapCanvasProps = {
  src: string;
  alt: string;
  shapes?: readonly MapShape[];
  pins?: readonly MapPin[];
  arrows?: readonly MapArrow[];
  /** Something drawn or placed that waits for a name before it exists: shown, not to be picked. */
  ghost?: { polygon?: readonly MapPoint[] | undefined; pin?: MapPoint | undefined } | undefined;
  mode: MapMode;
  /** The last change is still being saved: the points of the shape cannot be dragged until it is (a second edit would be built on the old shape). */
  locked?: boolean;
  /** The pins can be dragged to another place (the DM). */
  movable?: boolean;
  onShape?: (id: string) => void;
  onPin?: (id: string) => void;
  onDrawn?: (polygon: MapPoint[]) => void;
  onPlaced?: (at: MapPoint) => void;
  /** A pin was placed where it cannot be (outside its area). */
  onRefused?: () => void;
  onMovePin?: (id: string, at: MapPoint) => void;
  /** A point of the shape being edited was dragged: the new shape. */
  onShapeEdited?: (shapeId: string, polygon: MapPoint[]) => void;
  onArrow?: (id: string) => void;
  /** Two pins were picked in order, to make an exit from the first to the second. */
  onLink?: (fromId: string, toId: string) => void;
};

/** A touch that moves less than this many pixels is a click and not a drag. */
const CLICK_SLOP = 4;
const samePlace = (a: MapPoint, b: MapPoint): boolean => a.x === b.x && a.y === b.y;
const percent = (fraction: number): string => `${String(Math.round(fraction * 10000) / 100)}%`;

type Drag = { id: string; from: { x: number; y: number }; moved: boolean; at: MapPoint };
/** A point of a shape being dragged: which, where the pointer began, and where the point is now. */
type VertexDrag = { index: number; from: { x: number; y: number }; moved: boolean; at: MapPoint };

/**
 * A map picture with what the atlas puts on it: the areas as shapes, the places and the scenes as pins. The positions are
 * fractions of the picture, so they hold at any size. Everything that can be picked is a button, with its name.
 */
export function MapCanvas({ src, alt, shapes = [], pins = [], arrows = [], ghost, mode, locked = false, movable = false, onShape, onPin, onDrawn, onPlaced, onRefused, onMovePin, onShapeEdited, onArrow, onLink }: MapCanvasProps) {
  const surface = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<MapPoint[]>([]);
  // The drag is kept in a ref as well as in state: pointer events can come faster than the screen is drawn.
  const dragging = useRef<Drag | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const setDrag = (next: Drag | null): void => {
    dragging.current = next;
    setDragState(next);
  };
  const viewing = mode.kind === "view";
  // The drawing is as wide as the picture is: shapes and arrows are not stretched on a picture that is not square.
  const [width, setWidth] = useState(1);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const vertex = useRef<VertexDrag | null>(null);
  const [vertexLive, setVertexLive] = useState<VertexDrag | null>(null);
  const setVertex = (next: VertexDrag | null): void => {
    vertex.current = next;
    setVertexLive(next);
  };

  // A shape begun for one drawing is not kept for the next.
  useEffect(() => {
    if (mode.kind !== "draw") setDraft([]);
    if (mode.kind !== "link") setLinkFrom(null);
    if (mode.kind !== "edit") setVertex(null);
  }, [mode.kind]);

  const box = (): { left: number; top: number; width: number; height: number } => {
    const r = surface.current?.getBoundingClientRect();
    return r === undefined ? { left: 0, top: 0, width: 0, height: 0 } : { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  const clickSurface = (e: ReactMouseEvent<HTMLDivElement>): void => {
    // Only drawing and placing take clicks on the picture; picking, linking and editing the points of a shape do not.
    if (mode.kind !== "draw" && mode.kind !== "pin") return;
    const at = { x: e.clientX, y: e.clientY };
    const point = toMapPoint(box(), at);
    if (mode.kind === "pin") {
      if (mode.inside !== undefined && !pointInPolygon(point, mode.inside)) onRefused?.();
      else onPlaced?.(point);
      return;
    }
    const first = draft[0];
    if (first !== undefined && closesPolygon(box(), draft, first, at)) {
      onDrawn?.(draft);
      setDraft([]);
      return;
    }
    // A shape has a biggest number of points: past it the click is not taken, and the shape drawn so far is kept.
    if (draft.length >= MAX_POLYGON_POINTS) return;
    setDraft([...draft, point]);
  };

  const close = (): void => {
    if (draft.length < 3) return;
    onDrawn?.(draft);
    setDraft([]);
  };

  /** A pin picked while making an exit: the first is the start, the second the end; the same pin again takes the start back. */
  const linkPick = (id: string): void => {
    if (linkFrom === null) setLinkFrom(id);
    else if (linkFrom === id) setLinkFrom(null);
    else {
      onLink?.(linkFrom, id);
      setLinkFrom(null);
    }
  };

  const editing = mode.kind === "edit" ? mode.shapeId : null;
  /** The shape being edited, as it is while a point is dragged. */
  const editedShape = (shape: MapShape): readonly MapPoint[] => {
    if (editing !== shape.id || vertexLive === null || !vertexLive.moved) return shape.polygon;
    return shape.polygon.map((p, i) => (i === vertexLive.index ? vertexLive.at : p));
  };
  const startVertex = (e: ReactPointerEvent<HTMLButtonElement>, index: number, at: MapPoint): void => {
    if (locked) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer that cannot be captured is still followed while it is over the point */ }
    setVertex({ index, from: { x: e.clientX, y: e.clientY }, moved: false, at });
  };
  const moveVertex = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const now = vertex.current;
    if (now === null) return;
    const moved = now.moved || Math.hypot(e.clientX - now.from.x, e.clientY - now.from.y) > CLICK_SLOP;
    setVertex({ ...now, moved, at: moved ? toMapPoint(box(), { x: e.clientX, y: e.clientY }) : now.at });
  };
  const endVertex = (e: ReactPointerEvent<HTMLButtonElement>, shape: MapShape): void => {
    const now = vertex.current;
    if (now === null) return;
    const moved = now.moved || Math.hypot(e.clientX - now.from.x, e.clientY - now.from.y) > CLICK_SLOP;
    setVertex(null);
    if (!moved) return;
    const to = toMapPoint(box(), { x: e.clientX, y: e.clientY });
    onShapeEdited?.(shape.id, shape.polygon.map((p, i) => (i === now.index ? to : p)));
  };

  const pick = (e: KeyboardEvent, action: () => void): void => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    action();
  };

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, pin: MapPin): void => {
    if (!movable || !viewing) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer that cannot be captured is still followed while it is over the pin */ }
    setDrag({ id: pin.id, from: { x: e.clientX, y: e.clientY }, moved: false, at: pin.at });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const now = dragging.current;
    if (now === null) return;
    const moved = now.moved || Math.hypot(e.clientX - now.from.x, e.clientY - now.from.y) > CLICK_SLOP;
    setDrag({ ...now, moved, at: moved ? toMapPoint(box(), { x: e.clientX, y: e.clientY }) : now.at });
  };
  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>, pin: MapPin): void => {
    const now = dragging.current;
    if (now === null || now.id !== pin.id) return;
    const moved = now.moved || Math.hypot(e.clientX - now.from.x, e.clientY - now.from.y) > CLICK_SLOP;
    setDrag(null);
    if (moved) onMovePin?.(pin.id, toMapPoint(box(), { x: e.clientX, y: e.clientY }));
    else onPin?.(pin.id);
  };

  return (
    <div className="stack tight">
      <div ref={surface} className={viewing ? "atlas-map" : mode.kind === "link" ? "atlas-map linking" : mode.kind === "edit" ? "atlas-map editing" : "atlas-map placing"} data-testid="atlas-map" onClick={clickSurface}>
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(e) => {
            const { naturalWidth, naturalHeight } = e.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) setWidth(naturalWidth / naturalHeight);
          }}
        />
        <svg className="atlas-shapes" viewBox={`0 0 ${String(width)} 1`}>
          {shapes.map((shape) => (
            <polygon
              key={shape.id}
              className={shape.selected ? "atlas-area selected" : "atlas-area"}
              points={polygonAttribute(editedShape(shape), width)}
              // The same rule as the check of a pin inside an area (`pointInPolygon`, even-odd), also for a shape that crosses itself.
              fillRule="evenodd"
              role="button"
              tabIndex={viewing ? 0 : -1}
              aria-label={shape.label}
              aria-pressed={shape.selected}
              onClick={() => { if (viewing) onShape?.(shape.id); }}
              onKeyDown={(e) => { if (viewing) pick(e, () => { onShape?.(shape.id); }); }}
            />
          ))}
          {arrows.map((arrow) => {
            // An exit that goes both ways has two arrows between the same pins: each keeps to its own side, so both can be picked.
            const reciprocal = arrows.some((other) => other.id !== arrow.id && samePlace(other.from, arrow.to) && samePlace(other.to, arrow.from));
            const shape = arrowShape(arrow.from, arrow.to, width, reciprocal ? ARROW_SIDE : 0);
            if (shape === null) return null;
            return (
              <g
                key={arrow.id}
                className={arrow.selected ? "atlas-arrow selected" : "atlas-arrow"}
                role="button"
                tabIndex={viewing ? 0 : -1}
                aria-label={arrow.label}
                aria-pressed={arrow.selected}
                onClick={() => { if (viewing) onArrow?.(arrow.id); }}
                onKeyDown={(e) => { if (viewing) pick(e, () => { onArrow?.(arrow.id); }); }}
              >
                <line className="atlas-arrow-hit" {...shape.line} />
                <line className="atlas-arrow-line" {...shape.line} />
                <polygon className="atlas-arrow-head" points={shape.head} />
              </g>
            );
          })}
          {ghost?.polygon !== undefined && <polygon className="atlas-ghost" points={polygonAttribute(ghost.polygon, width)} fillRule="evenodd" aria-hidden="true" />}
          {draft.length > 1 && <polyline className="atlas-draft" points={polygonAttribute(draft, width)} fillRule="evenodd" />}
        </svg>
        {draft.map((p, i) => (
          <span key={i} className="atlas-draft-point" data-testid="atlas-draft-point" style={{ left: percent(p.x), top: percent(p.y) }} />
        ))}
        {ghost?.pin !== undefined && <span className="atlas-ghost-pin" data-testid="atlas-ghost-pin" aria-hidden="true" style={{ left: percent(ghost.pin.x), top: percent(ghost.pin.y) }} />}
        {shapes.filter((shape) => shape.id === editing).flatMap((shape) =>
          editedShape(shape).map((p, index) => (
            <button
              key={`${shape.id}-${String(index)}`}
              type="button"
              className="atlas-vertex"
              disabled={locked}
              style={{ left: percent(p.x), top: percent(p.y) }}
              aria-label={t("ui.world.atlas.vertex", { n: String(index + 1), name: shape.label })}
              onPointerDown={(e) => { startVertex(e, index, p); }}
              onPointerMove={moveVertex}
              onPointerUp={(e) => { endVertex(e, shape); }}
            />
          )),
        )}
        {pins.map((pin) => {
          const at = drag?.id === pin.id && drag.moved ? drag.at : pin.at;
          return (
            <button
              key={pin.id}
              type="button"
              className={`atlas-pin ${pin.kind}${pin.selected ? " selected" : ""}`}
              style={{ left: percent(at.x), top: percent(at.y) }}
              aria-label={pin.label}
              aria-pressed={pin.selected || linkFrom === pin.id}
              onClick={() => {
                if (mode.kind === "link") linkPick(pin.id);
                else if (viewing && !movable) onPin?.(pin.id);
              }}
              onKeyDown={(e) => {
                if (mode.kind === "link") pick(e, () => { linkPick(pin.id); });
                else if (viewing) pick(e, () => { onPin?.(pin.id); });
              }}
              onPointerDown={(e) => { startDrag(e, pin); }}
              onPointerMove={moveDrag}
              onPointerUp={(e) => { endDrag(e, pin); }}
            >
              <span className="atlas-pin-name">{pin.label}</span>
            </button>
          );
        })}
      </div>
      {mode.kind === "draw" && draft.length >= MAX_POLYGON_POINTS && <p className="notice" role="status">{t("ui.world.atlas.max-points", { max: String(MAX_POLYGON_POINTS) })}</p>}
      {mode.kind === "draw" && (
        <div className="row">
          <button type="button" className="btn small" disabled={draft.length < 3} onClick={close}>{t("ui.world.atlas.close-shape")}</button>
          <button type="button" className="btn quiet small" onClick={() => { setDraft([]); }}>{t("ui.world.atlas.restart")}</button>
        </div>
      )}
    </div>
  );
}
