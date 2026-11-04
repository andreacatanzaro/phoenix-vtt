import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import type { TableScene, TokenView } from "@phoenix/shared";
import { crossingPoint, dragTo, gridOf, handleAt, HANDLE_PX, type AlignHandle, type AlignState, type AlignStep } from "./align";
import { boardSize, cellAt, cellRectBetween, clampCell, fitView, groupDrop, keepCenterOnResize, panBy, samePoint, toScene, tokenAt, tokenRect, viewCenter, viewFor, zoomAt, type Point, type View } from "./geometry";
import { formatMeters, radiusDistance, rulerDistance } from "./measure";
import { readPalette, type Palette } from "./palette";
import { colorOf, livePointers, type RemotePointer } from "./pointers";
import { combineSelection, rectBetween, tokensInLasso, tokensInRect } from "./selection";
import { TextureCache } from "./texture-cache";
import type { MeasureMode, SelectMode, Tool } from "./tools";

export type BoardProps = {
  scene: TableScene;
  tokens: readonly TokenView[];
  /** Who looks: the DM moves every token, a player only their own. */
  me: { accountId: string; role: "dm" | "player" };
  selectedIds: ReadonlySet<string>;
  tool: Tool;
  selectMode: SelectMode;
  measureMode: MeasureMode;
  showStart: boolean;
  /** The address a picture of this world is loaded from. */
  imageUrl: (imageId: string) => string;
  /** Goes up when the server refused something, so tokens dragged by hand return to where the server has them. */
  revision: number;
  /** Where the others are pointing. */
  pointers: ReadonlyMap<string, RemotePointer>;
  /** The DM asked everyone to look here. Each new `seq` is a new request. */
  viewRequest: { x: number; y: number; zoom: number; seq: number } | null;
  /** Each new value shows the whole board again. */
  resetViewSeq: number;
  /** The DM is aligning the map to the grid: the step, the state, and whether the grid is drawn before the last step. */
  align: { step: AlignStep; state: AlignState; preview: boolean } | null;
};

export type BoardMove = { id: string; x: number; y: number };

export type BoardCallbacks = {
  onSelect: (tokenIds: string[]) => void;
  onMove: (moves: BoardMove[]) => void;
  /** Where the pointer is, in scene pixels; null when it is put away. */
  onPointer: (x: number | null, y: number | null) => void;
  /** The text tool was used on empty ground: the square, and where on the screen to ask for the words. */
  onPlaceText: (cell: Point, screenAt: Point) => void;
  /** The view changed: the point of the scene in the middle of the screen, and the zoom. */
  onView: (view: { x: number; y: number; zoom: number }) => void;
  /** Where on the screen the selection is (the bottom middle of it), for the bar that goes with it; null when there is none. */
  onAnchor: (screenAt: Point | null) => void;
  /** A handle of the alignment was dragged: the new state. */
  onAlign: (state: AlignState) => void;
  /** The start zone was drawn: its first square and its size, in squares. */
  onStartZone: (zone: { x: number; y: number; w: number; h: number }) => void;
};

type Drag =
  | { kind: "pan"; last: Point }
  | { kind: "group"; grab: Point; items: { token: TokenView; node: Container; start: Point }[]; moved: boolean }
  | { kind: "box"; from: Point; to: Point; additive: boolean; before: ReadonlySet<string> }
  | { kind: "lasso"; loop: Point[]; additive: boolean; before: ReadonlySet<string> }
  | { kind: "measure"; from: Point; to: Point }
  | { kind: "align"; handle: AlignHandle; base: AlignState }
  | { kind: "zone"; from: Point; to: Point }
  | null;

const WHEEL_STEP = 0.0015;
const MIN_FONT = 11;
const POINTER_SEND_MS = 50;
const VIEW_REPORT_MS = 120;
const POINTER_REFRESH_MS = 500;
/** A drag shorter than this (in screen pixels) is a click. */
const CLICK_SLOP = 4;
/** The loupe shown while a handle of the alignment is dragged: its size on the screen, and how much of the screen it magnifies. */
const LOUPE_SIZE = 132;
const LOUPE_SOURCE = 22;
const CURSORS: Record<Tool, string> = { move: "grab", select: "default", measure: "crosshair", pointer: "none", text: "text", start: "crosshair" };

function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(Texture.from(image));
    };
    image.onerror = () => {
      reject(new Error("The picture could not be loaded"));
    };
    image.src = url;
  });
}

/**
 * The picture of the table: the map, the grid, the tokens, the texts and what the tools draw, with PixiJS inside `host`.
 * It knows nothing about the network: it shows what it is given and reports what the person did through the callbacks.
 */
export class BoardView {
  private readonly world = new Container();
  private readonly mapLayer = new Container();
  private readonly gridLayer = new Graphics();
  private readonly startLayer = new Graphics();
  private readonly tokenLayer = new Container();
  private readonly toolLayer = new Container();
  private readonly alignLayer = new Graphics();
  private readonly pointerLayer = new Container();
  /** In screen coordinates, above the world: the selection box and the lasso. */
  private readonly overlay = new Graphics();
  private readonly palette: Palette;
  private readonly textures = new TextureCache<Texture>(() => Date.now());
  private view: View = { zoom: 1, panX: 0, panY: 0 };
  private props: BoardProps | null = null;
  private drag: Drag = null;
  private fittedFor: string | null = null;
  /** The size of the screen the view was last laid out for, to keep the place when it changes. */
  private lastScreen: { w: number; h: number } | null = null;
  /** Whether the view was fitted to a screen that had a real size (it may not have had one yet when the board began). */
  private fitValid = false;
  private mapFor: string | null = null;
  private mapReady = false;
  private seenViewRequest = 0;
  private seenReset = 0;
  private lastPointerSent = 0;
  private pointerShown = false;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerKeys = "";
  /** The handle the pointer is over while aligning, so it can be drawn as the one that will be taken. */
  private alignHover: AlignHandle | null = null;
  /** The last place reported for the selection bar, so the same place is not reported again (that would redraw the board forever). */
  private reportedAnchor: Point | null = null;
  private loupe: HTMLCanvasElement | null = null;
  private loupeAt: Point | null = null;
  private gone = false;
  private readonly cleanup: (() => void)[] = [];

  private constructor(
    private readonly app: Application,
    private readonly host: HTMLElement,
    private readonly callbacks: BoardCallbacks,
  ) {
    this.palette = readPalette();
    this.world.addChild(this.mapLayer, this.gridLayer, this.startLayer, this.tokenLayer, this.toolLayer, this.alignLayer, this.pointerLayer);
    app.stage.addChild(this.world, this.overlay);
    this.listen();
  }

  static async create(host: HTMLElement, callbacks: BoardCallbacks): Promise<BoardView> {
    const palette = readPalette();
    const app = new Application();
    await app.init({ resizeTo: host, background: palette.night, antialias: true, autoDensity: true, resolution: window.devicePixelRatio });
    host.appendChild(app.canvas);
    return new BoardView(app, host, callbacks);
  }

  // ---- the view of the board ----

  /** The view as the readout shows it: the middle of the screen in scene pixels, and the zoom. */
  getView(): { x: number; y: number; zoom: number } {
    const c = viewCenter(this.view, this.screen());
    return { x: c.x, y: c.y, zoom: this.view.zoom };
  }

  /** Puts a point of the scene in the middle of the screen at this zoom. */
  setView(center: Point, zoom: number): void {
    this.view = viewFor(center, zoom, this.screen());
    this.applyView();
  }

  private screen(): { w: number; h: number } {
    return { w: this.app.screen.width, h: this.app.screen.height };
  }

  private applyView(): void {
    this.world.position.set(this.view.panX, this.view.panY);
    this.world.scale.set(this.view.zoom);
    this.drawAlign();
    this.reportView();
    this.reportAnchor();
  }

  private reportView(): void {
    if (this.viewTimer !== null) return;
    this.viewTimer = setTimeout(() => {
      this.viewTimer = null;
      if (!this.gone) this.callbacks.onView(this.getView());
    }, VIEW_REPORT_MS);
  }

  private fit(): void {
    const props = this.props;
    if (props === null) return;
    const screen = this.screen();
    this.view = fitView(boardSize(props.scene), screen);
    this.lastScreen = screen;
    this.fitValid = screen.w > 0 && screen.h > 0;
    this.applyView();
  }

  /** Moves the view by this many screen pixels (arrow keys). */
  nudge(dx: number, dy: number): void {
    this.view = { ...this.view, panX: this.view.panX + dx, panY: this.view.panY + dy };
    this.applyView();
  }

  /** Zooms by this factor around the middle of the screen (the plus and minus keys). */
  zoomBy(factor: number): void {
    const screen = this.screen();
    this.view = zoomAt(this.view, factor, { x: screen.w / 2, y: screen.h / 2 });
    this.applyView();
  }

  // ---- input ----

  private local(e: { clientX: number; clientY: number }): Point {
    const box = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  private movable(token: TokenView): boolean {
    const props = this.props;
    return props !== null && (props.me.role === "dm" || token.ownerAccountId === props.me.accountId);
  }

  private listen(): void {
    const canvas = this.app.canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): void => {
      canvas.addEventListener(type, fn, options);
      this.cleanup.push(() => { canvas.removeEventListener(type, fn); });
    };

    on("pointerdown", (e) => {
      const props = this.props;
      if (props === null) return;
      canvas.setPointerCapture(e.pointerId);
      const at = this.local(e);
      // While the map is aligned, a handle is dragged and anything else pans; the wheel button always pans.
      if (e.button !== 1 && props.align !== null) {
        const handle = handleAt(props.align.step, props.align.state, toScene(this.view, at), this.view.zoom);
        this.drag = handle === null ? { kind: "pan", last: at } : { kind: "align", handle, base: props.align.state };
        return;
      }
      // The wheel button always pans, whatever the tool.
      if (e.button === 1 || props.tool === "move") {
        this.drag = { kind: "pan", last: at };
        return;
      }
      const scenePoint = toScene(this.view, at);
      const hit = tokenAt(props.scene, props.tokens, scenePoint);
      if (props.tool === "select") this.startSelect(hit, at, scenePoint, e.shiftKey);
      else if (props.tool === "measure") this.drag = { kind: "measure", from: scenePoint, to: scenePoint };
      else if (props.tool === "start") this.drag = { kind: "zone", from: scenePoint, to: scenePoint };
      else if (props.tool === "text" && hit === null) this.callbacks.onPlaceText(clampCell(cellAt(props.scene, scenePoint)), at);
    });

    on("pointermove", (e) => {
      const props = this.props;
      if (props === null) return;
      const at = this.local(e);
      const scenePoint = toScene(this.view, at);
      if (props.tool === "pointer" && props.align === null) this.sendPointer(scenePoint);
      const drag = this.drag;
      if (drag === null) {
        if (props.align !== null) this.hoverAlign(props.align, scenePoint);
        return;
      }
      if (drag.kind === "pan") {
        this.view = panBy(this.view, drag.last, at);
        drag.last = at;
        this.applyView();
      } else if (drag.kind === "group") {
        const dx = scenePoint.x - drag.grab.x;
        const dy = scenePoint.y - drag.grab.y;
        drag.moved = drag.moved || Math.hypot(dx, dy) * this.view.zoom > CLICK_SLOP;
        for (const item of drag.items) item.node.position.set(item.start.x + dx, item.start.y + dy);
        this.sayAnchor(null);
      } else if (drag.kind === "box") {
        drag.to = at;
        this.drawOverlay();
      } else if (drag.kind === "lasso") {
        drag.loop.push(at);
        this.drawOverlay();
      } else if (drag.kind === "zone") {
        drag.to = scenePoint;
        this.drawZone(props, drag);
      } else if (drag.kind === "align") {
        this.loupeAt = at;
        this.callbacks.onAlign(dragTo(drag.handle, drag.base, scenePoint));
      } else {
        drag.to = scenePoint;
        this.drawMeasure(props);
      }
    });

    on("pointerleave", () => {
      if (this.props?.tool === "pointer") this.putPointerAway();
    });

    const finish = (e: PointerEvent): void => {
      const props = this.props;
      const drag = this.drag;
      this.drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      this.hideLoupe();
      if (props === null || drag === null) return;
      if (drag.kind === "group") this.dropGroup(props, drag);
      else if (drag.kind === "box") this.finishBox(props, drag);
      else if (drag.kind === "lasso") this.finishLasso(props, drag);
      else if (drag.kind === "zone") this.finishZone(props, drag);
      // A ruler stays on the board until it is replaced or the tool is changed.
      this.drawOverlay();
    };
    on("pointerup", finish);
    on("pointercancel", finish);

    on(
      "wheel",
      (e) => {
        e.preventDefault();
        this.view = zoomAt(this.view, Math.exp(-e.deltaY * WHEEL_STEP), this.local(e));
        this.applyView();
      },
      { passive: false },
    );
    // The middle button would scroll the page: it is for panning.
    on("auxclick", (e) => { e.preventDefault(); });

    const observer = new ResizeObserver(() => {
      if (this.props === null) return;
      this.app.resize();
      const next = this.screen();
      if (!this.fitValid || this.lastScreen === null) {
        // The board began before it had a size: this is the first real one, so the whole board is shown.
        if (next.w > 0 && next.h > 0) this.fit();
        return;
      }
      // Later changes (a window resized, a device turned) keep the place the person chose and the zoom.
      this.view = keepCenterOnResize(this.view, this.lastScreen, next);
      this.lastScreen = next;
      this.applyView();
    });
    observer.observe(this.host);
    this.cleanup.push(() => { observer.disconnect(); });

    const refresh = setInterval(() => { this.drawPointers(false); }, POINTER_REFRESH_MS);
    this.cleanup.push(() => { clearInterval(refresh); });
  }

  private startSelect(hit: TokenView | null, at: Point, scenePoint: Point, additive: boolean): void {
    const props = this.props;
    if (props === null) return;
    const selected = new Set(props.selectedIds);
    if (hit === null) {
      if (!additive) this.callbacks.onSelect([]);
      // With Shift the shape works on the selection (see `combineSelection`) instead of replacing it.
      const before = new Set(props.selectedIds);
      this.drag = props.selectMode === "lasso" ? { kind: "lasso", loop: [at], additive, before } : { kind: "box", from: at, to: at, additive, before };
      return;
    }
    if (additive) {
      if (selected.has(hit.id)) selected.delete(hit.id);
      else selected.add(hit.id);
      this.callbacks.onSelect([...selected]);
      return;
    }
    // A token outside the selection becomes the selection; one inside it keeps the group, so it can be moved together.
    const group = selected.has(hit.id) ? [...selected] : [hit.id];
    if (!selected.has(hit.id)) this.callbacks.onSelect(group);
    const items: { token: TokenView; node: Container; start: Point }[] = [];
    for (const id of group) {
      const token = props.tokens.find((t) => t.id === id);
      const node = this.tokenLayer.children.find((c) => c.label === id);
      if (token !== undefined && node !== undefined && this.movable(token)) items.push({ token, node, start: { x: node.x, y: node.y } });
    }
    if (items.length > 0) this.drag = { kind: "group", grab: scenePoint, items, moved: false };
  }

  private dropGroup(props: BoardProps, drag: Extract<NonNullable<Drag>, { kind: "group" }>): void {
    // The picture goes back to the squares it was on, or lands on the new ones: the server then says what is true.
    const first = drag.items[0];
    if (first === undefined || !drag.moved) {
      for (const item of drag.items) item.node.position.set(item.start.x, item.start.y);
      this.reportAnchor();
      return;
    }
    const moves: BoardMove[] = groupDrop(props.scene, drag.items.map((i) => i.token), { x: first.node.x - first.start.x, y: first.node.y - first.start.y });
    for (const item of drag.items) {
      const to = moves.find((m) => m.id === item.token.id) ?? item.token;
      const rect = tokenRect(props.scene, { ...item.token, x: to.x, y: to.y });
      item.node.position.set(rect.x, rect.y);
    }
    if (moves.length > 0) this.callbacks.onMove(moves);
    this.reportAnchor();
  }

  private finishBox(props: BoardProps, drag: Extract<NonNullable<Drag>, { kind: "box" }>): void {
    const a = toScene(this.view, drag.from);
    const b = toScene(this.view, drag.to);
    // A click on empty ground only lets go of the selection, which was done when it began.
    if (Math.hypot(drag.to.x - drag.from.x, drag.to.y - drag.from.y) < CLICK_SLOP) return;
    this.callbacks.onSelect(combineSelection(drag.before, tokensInRect(props.scene, props.tokens, rectBetween(a, b)).map((t) => t.id), drag.additive));
  }

  private finishLasso(props: BoardProps, drag: Extract<NonNullable<Drag>, { kind: "lasso" }>): void {
    const loop = drag.loop.map((p) => toScene(this.view, p));
    this.callbacks.onSelect(combineSelection(drag.before, tokensInLasso(props.scene, props.tokens, loop).map((t) => t.id), drag.additive));
  }

  // ---- pointer ----

  private sendPointer(scenePoint: Point): void {
    const now = Date.now();
    this.pointerShown = true;
    this.drawLocalPointer(scenePoint);
    if (now - this.lastPointerSent < POINTER_SEND_MS) return;
    this.lastPointerSent = now;
    this.callbacks.onPointer(scenePoint.x, scenePoint.y);
  }

  private putPointerAway(): void {
    if (!this.pointerShown) return;
    this.pointerShown = false;
    this.callbacks.onPointer(null, null);
    this.drawPointers(true);
  }

  // ---- drawing ----

  /** Shows the given state. Cheap enough to call on every change. */
  update(props: BoardProps): void {
    if (this.gone) return;
    const previous = this.props;
    this.props = props;
    this.app.canvas.style.cursor = props.align === null ? CURSORS[props.tool] : this.alignHover === null ? "grab" : "pointer";
    if (props.align === null) this.alignHover = null;
    if (previous !== null && previous.tool !== props.tool) {
      // Changing tool puts away what the last one was doing: the ruler, the pointer, a drag in progress.
      this.drag = null;
      this.toolLayer.removeChildren().forEach((c) => { c.destroy({ children: true }); });
      if (previous.tool === "pointer") this.putPointerAway();
    }
    const board = boardSize(props.scene);
    const fitKey = `${props.scene.id}:${String(board.w)}x${String(board.h)}`;
    if (this.fittedFor !== fitKey) {
      this.fittedFor = fitKey;
      this.fit();
    }
    if (props.resetViewSeq !== this.seenReset) {
      this.seenReset = props.resetViewSeq;
      this.fit();
    }
    const request = props.viewRequest;
    if (request !== null && request.seq !== this.seenViewRequest) {
      this.seenViewRequest = request.seq;
      this.setView({ x: request.x, y: request.y }, request.zoom);
    }
    const mapChanged = previous === null || previous.scene.mapImageId !== props.scene.mapImageId || previous.scene.id !== props.scene.id;
    if (mapChanged || (props.scene.mapImageId !== null && !this.mapReady)) void this.drawMap(props, mapChanged);
    this.drawGrid(props.scene);
    this.drawStart(props);
    this.drawTokens(props);
    this.drawPointers(true);
    this.drawOverlay();
    this.drawAlign();
    this.reportAnchor();
  }

  private async drawMap(props: BoardProps, changed: boolean): Promise<void> {
    const imageId = props.scene.mapImageId;
    if (changed) {
      this.mapFor = imageId;
      this.mapReady = false;
      this.mapLayer.removeChildren().forEach((c) => { c.destroy(); });
    }
    if (imageId === null) return;
    const texture = await this.texture(imageId, props.imageUrl);
    // The scene may have changed while the picture loaded, or another update may have drawn it first.
    if (this.gone || texture === null || this.mapFor !== imageId || this.mapReady) return;
    this.mapLayer.addChild(new Sprite(texture));
    this.mapReady = true;
  }

  /** The picture, or null while it cannot be had; a failed one is asked for again after a few seconds. */
  private texture(imageId: string, url: (id: string) => string): Promise<Texture | null> {
    return this.textures.get(imageId, () => loadTexture(url(imageId)));
  }

  private drawGrid(scene: TableScene): void {
    const { w, h } = boardSize(scene);
    const g = this.gridLayer.clear();
    const step = scene.gridPx;
    const startX = ((scene.gridOffsetX % step) + step) % step;
    const startY = ((scene.gridOffsetY % step) + step) % step;
    for (let x = startX; x <= w; x += step) g.moveTo(x, 0).lineTo(x, h);
    for (let y = startY; y <= h; y += step) g.moveTo(0, y).lineTo(w, y);
    g.stroke({ width: 1, color: this.palette.bone, alpha: 0.18, pixelLine: true });
    g.rect(0, 0, w, h).stroke({ width: 1, color: this.palette.line, alpha: 1, pixelLine: true });
  }

  private drawStart(props: BoardProps): void {
    const g = this.startLayer.clear();
    if (!props.showStart || props.me.role !== "dm") return;
    const { x, y, w, h } = props.scene.start;
    const r = tokenRect(props.scene, { x, y, size: 1 });
    g.rect(r.x, r.y, w * props.scene.gridPx, h * props.scene.gridPx)
      .fill({ color: this.palette.green, alpha: 0.12 })
      .stroke({ width: 2, color: this.palette.green, alpha: 0.8, pixelLine: true });
  }

  private drawTokens(props: BoardProps): void {
    const dragged = this.drag?.kind === "group" ? this.drag : null;
    const held = dragged === null ? new Map<string, Point>() : new Map(dragged.items.map((i) => [i.token.id, { x: i.node.x, y: i.node.y }]));
    this.tokenLayer.removeChildren().forEach((c) => { c.destroy({ children: true }); });
    for (const token of props.tokens) this.tokenLayer.addChild(this.tokenNode(token, props));
    if (dragged === null) return;
    // Someone else's move arrived while tokens are in hand: the drag goes on with the new picture.
    const items = dragged.items.flatMap((item) => {
      const node = this.tokenLayer.children.find((c) => c.label === item.token.id);
      const at = held.get(item.token.id);
      if (node === undefined || at === undefined) return [];
      node.position.set(at.x, at.y);
      return [{ ...item, node }];
    });
    if (items.length === 0) this.drag = null;
    else dragged.items = items;
  }

  private tokenNode(token: TokenView, props: BoardProps): Container {
    return token.kind === "text" ? this.textNode(token, props) : this.figureNode(token, props);
  }

  private textNode(token: TokenView, props: BoardProps): Container {
    const p = this.palette;
    const rect = tokenRect(props.scene, token);
    const node = new Container();
    node.label = token.id;
    node.position.set(rect.x, rect.y);
    // The DM sees hidden texts, dimmed: a player never receives them.
    if (token.hidden) node.alpha = 0.45;
    const selected = props.selectedIds.has(token.id);
    const pad = props.scene.gridPx * 0.06;
    const font = Math.max(MIN_FONT, props.scene.gridPx * 0.3);
    const text = new Text({ text: token.label, style: { fontFamily: p.ui, fontSize: font, fontWeight: "600", fill: p.bone, wordWrap: true, wordWrapWidth: rect.w - pad * 2, lineHeight: font * 1.25 } });
    text.position.set(pad, pad);
    const back = new Graphics();
    back.roundRect(0, 0, rect.w, Math.max(rect.h, text.height + pad * 2), pad * 1.5).fill({ color: p.night, alpha: 0.72 });
    if (selected) back.roundRect(0, 0, rect.w, Math.max(rect.h, text.height + pad * 2), pad * 1.5).stroke({ width: 3, color: p.gold });
    node.addChild(back, text);
    return node;
  }

  private figureNode(token: TokenView, props: BoardProps): Container {
    const p = this.palette;
    const rect = tokenRect(props.scene, token);
    const node = new Container();
    node.label = token.id;
    node.position.set(rect.x, rect.y);
    // The DM sees hidden tokens, dimmed: a player never receives them.
    if (token.hidden) node.alpha = 0.45;
    const radius = rect.w / 2;
    const selected = props.selectedIds.has(token.id);
    const mine = token.ownerAccountId === props.me.accountId;

    const body = new Graphics();
    body.circle(radius, radius, radius - 3).fill(p.tokens[token.color]);
    body.circle(radius, radius, radius - 3).stroke({ width: selected ? 4 : 2, color: selected || mine ? p.gold : p.night, alpha: selected || mine ? 1 : 0.9 });
    node.addChild(body);

    const font = Math.max(MIN_FONT, props.scene.gridPx * 0.26);
    const initials = new Text({ text: token.label.slice(0, 2).toUpperCase(), style: { fontFamily: p.ui, fontSize: font * 1.4, fontWeight: "700", fill: token.color === "white" || token.color === "gold" || token.color === "green" ? p.night : p.bone } });
    initials.anchor.set(0.5);
    initials.position.set(radius, radius);
    node.addChild(initials);

    if (token.imageId !== null) void this.attachPicture(node, token.imageId, radius, props.imageUrl, initials);

    const name = new Text({ text: token.label, style: { fontFamily: p.ui, fontSize: font, fontWeight: "600", fill: p.bone, stroke: { color: p.night, width: 3 } } });
    name.anchor.set(0.5, 0);
    name.position.set(radius, rect.h - 2);
    node.addChild(name);
    return node;
  }

  private async attachPicture(node: Container, imageId: string, radius: number, url: (id: string) => string, hide: Text): Promise<void> {
    const texture = await this.texture(imageId, url);
    if (this.gone || texture === null || node.destroyed) return;
    const picture = new Sprite(texture);
    const inner = radius - 3;
    picture.width = inner * 2;
    picture.height = inner * 2;
    picture.position.set(3, 3);
    const mask = new Graphics().circle(radius, radius, inner).fill(this.palette.bone);
    picture.mask = mask;
    node.addChildAt(picture, 1);
    node.addChildAt(mask, 1);
    hide.visible = false;
  }

  /** The selection box and the lasso, in screen pixels. */
  private drawOverlay(): void {
    const g = this.overlay.clear();
    const drag = this.drag;
    const p = this.palette;
    if (drag?.kind === "box") {
      const r = rectBetween(drag.from, drag.to);
      g.rect(r.x, r.y, r.w, r.h).fill({ color: p.gold, alpha: 0.12 }).stroke({ width: 1, color: p.gold, alpha: 0.9, pixelLine: true });
    } else if (drag?.kind === "lasso" && drag.loop.length > 1) {
      const [first, ...rest] = drag.loop;
      if (first !== undefined) {
        g.moveTo(first.x, first.y);
        for (const q of rest) g.lineTo(q.x, q.y);
        g.closePath().fill({ color: p.gold, alpha: 0.1 }).stroke({ width: 1.5, color: p.gold, alpha: 0.9 });
      }
    }
    if (this.props?.tool === "measure" && drag?.kind === "measure") this.drawMeasure(this.props);
  }

  /** The handle under the pointer while aligning is drawn as the one that will be taken, and the cursor says so. */
  private hoverAlign(align: NonNullable<BoardProps["align"]>, scenePoint: Point): void {
    const handle = handleAt(align.step, align.state, scenePoint, this.view.zoom);
    if ((handle === null) !== (this.alignHover === null) || (handle?.kind === "crossing" && this.alignHover?.kind === "crossing" && (handle.crossing.i !== this.alignHover.crossing.i || handle.crossing.j !== this.alignHover.crossing.j))) {
      this.alignHover = handle;
      this.app.canvas.style.cursor = handle === null ? "grab" : "pointer";
      this.drawAlign();
    }
  }

  /** What the alignment shows: the crossing, the square or the whole grid, and the handle to drag in this step. */
  private drawAlign(): void {
    const g = this.alignLayer.clear();
    const props = this.props;
    const align = props?.align ?? null;
    if (props === null || align === null) return;
    const { state, step } = align;
    const p = this.palette;
    const unit = 1 / this.view.zoom;
    const board = boardSize(props.scene);
    const handleRadius = HANDLE_PX * 0.6 * unit;
    if (step === "refine" || align.preview) {
      const grid = gridOf(state);
      const size = state.size;
      for (let x = grid.gridOffsetX; x <= board.w; x += size) g.moveTo(x, 0).lineTo(x, board.h);
      for (let y = grid.gridOffsetY; y <= board.h; y += size) g.moveTo(0, y).lineTo(board.w, y);
      g.stroke({ width: unit, color: p.gold, alpha: step === "refine" ? 0.7 : 0.4 });
    }
    if (step === "offset") {
      g.moveTo(state.anchor.x, 0).lineTo(state.anchor.x, board.h).moveTo(0, state.anchor.y).lineTo(board.w, state.anchor.y).stroke({ width: unit, color: p.gold, alpha: 0.6 });
    } else if (step === "size") {
      g.rect(state.anchor.x, state.anchor.y, state.size, state.size).fill({ color: p.gold, alpha: 0.12 }).stroke({ width: 2 * unit, color: p.gold, alpha: 0.95 });
    }
    // The anchor is always shown; in the step "Offset" it is the handle.
    const hovered = this.alignHover;
    const dragging = this.drag?.kind === "align" ? this.drag.handle : null;
    const active = dragging ?? hovered;
    const ring = (at: Point, taken: boolean): void => {
      g.circle(at.x, at.y, handleRadius).fill({ color: p.night, alpha: 0.65 }).stroke({ width: 2 * unit, color: p.gold, alpha: taken ? 1 : 0.8 });
      g.circle(at.x, at.y, (taken ? 3.5 : 2.5) * unit).fill({ color: p.gold, alpha: 1 });
    };
    if (step === "offset") ring(state.anchor, active?.kind === "anchor");
    else g.circle(state.anchor.x, state.anchor.y, 3 * unit).fill({ color: p.gold, alpha: 1 });
    if (step === "size") ring({ x: state.anchor.x + state.size, y: state.anchor.y + state.size }, active?.kind === "corner");
    if (step === "refine" && active?.kind === "crossing") ring(crossingPoint(state, active.crossing), dragging !== null);
    if (dragging !== null) this.showLoupe();
    else this.hideLoupe();
  }

  /** A magnifying glass next to the pointer, so the handle can be put on a crossing of the map exactly. */
  private showLoupe(): void {
    const at = this.loupeAt;
    if (at === null || this.gone) return;
    try {
      const source = this.app.renderer.extract.canvas({ target: this.app.stage, frame: new Rectangle(at.x - LOUPE_SOURCE, at.y - LOUPE_SOURCE, LOUPE_SOURCE * 2, LOUPE_SOURCE * 2), resolution: window.devicePixelRatio });
      if (!(source instanceof HTMLCanvasElement)) return;
      if (this.loupe === null) {
        this.loupe = document.createElement("canvas");
        this.loupe.className = "loupe";
        this.loupe.setAttribute("aria-hidden", "true");
        this.host.appendChild(this.loupe);
      }
      const size = Math.round(LOUPE_SIZE * window.devicePixelRatio);
      this.loupe.width = size;
      this.loupe.height = size;
      const ctx = this.loupe.getContext("2d");
      if (ctx === null) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, 0, 0, size, size);
      ctx.strokeStyle = "rgba(232, 165, 48, 0.9)";
      ctx.lineWidth = Math.max(1, window.devicePixelRatio);
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();
      const screen = this.screen();
      this.loupe.style.width = `${String(LOUPE_SIZE)}px`;
      this.loupe.style.height = `${String(LOUPE_SIZE)}px`;
      this.loupe.style.left = `${String(Math.max(0, Math.min(screen.w - LOUPE_SIZE, at.x + 28)))}px`;
      this.loupe.style.top = `${String(Math.max(0, Math.min(screen.h - LOUPE_SIZE, at.y - 28 - LOUPE_SIZE)))}px`;
    } catch {
      // A loupe is a help: without it the alignment still works.
      this.hideLoupe();
    }
  }

  private hideLoupe(): void {
    this.loupeAt = null;
    this.loupe?.remove();
    this.loupe = null;
  }

  /** The squares the start zone would cover, shown while it is drawn. */
  private drawZone(props: BoardProps, drag: Extract<NonNullable<Drag>, { kind: "zone" }>): void {
    this.toolLayer.removeChildren().forEach((c) => { c.destroy({ children: true }); });
    const zone = cellRectBetween(props.scene, drag.from, drag.to);
    const r = tokenRect(props.scene, { x: zone.x, y: zone.y, size: 1 });
    const g = new Graphics();
    g.rect(r.x, r.y, zone.w * props.scene.gridPx, zone.h * props.scene.gridPx)
      .fill({ color: this.palette.green, alpha: 0.18 })
      .stroke({ width: 2 / this.view.zoom, color: this.palette.green, alpha: 0.95 });
    this.toolLayer.addChild(g);
  }

  private finishZone(props: BoardProps, drag: Extract<NonNullable<Drag>, { kind: "zone" }>): void {
    this.toolLayer.removeChildren().forEach((c) => { c.destroy({ children: true }); });
    this.callbacks.onStartZone(cellRectBetween(props.scene, drag.from, drag.to));
  }

  private drawMeasure(props: BoardProps): void {
    const drag = this.drag;
    this.toolLayer.removeChildren().forEach((c) => { c.destroy({ children: true }); });
    if (drag?.kind !== "measure") return;
    const p = this.palette;
    const g = new Graphics();
    const fontSize = Math.max(14, props.scene.gridPx * 0.35);
    let label: string;
    let at: Point;
    if (props.measureMode === "radius") {
      const r = radiusDistance(props.scene, drag.from, drag.to);
      g.circle(r.center.x, r.center.y, r.px).fill({ color: p.gold, alpha: 0.12 }).stroke({ width: 2 / this.view.zoom, color: p.gold });
      g.moveTo(r.center.x, r.center.y).lineTo(drag.to.x, drag.to.y).stroke({ width: 2 / this.view.zoom, color: p.gold });
      label = formatMeters(r.meters);
      at = { x: (r.center.x + drag.to.x) / 2, y: (r.center.y + drag.to.y) / 2 };
    } else {
      const r = rulerDistance(props.scene, drag.from, drag.to);
      g.moveTo(r.from.x, r.from.y).lineTo(r.to.x, r.to.y).stroke({ width: 3 / this.view.zoom, color: p.gold });
      g.circle(r.from.x, r.from.y, 5 / this.view.zoom).fill(p.gold);
      g.circle(r.to.x, r.to.y, 5 / this.view.zoom).fill(p.gold);
      label = formatMeters(r.meters);
      at = { x: (r.from.x + r.to.x) / 2, y: (r.from.y + r.to.y) / 2 };
    }
    // The reading is as big on the screen whatever the zoom.
    const text = new Text({ text: label, style: { fontFamily: p.ui, fontSize, fontWeight: "700", fill: p.night } });
    text.anchor.set(0.5);
    const chip = new Graphics();
    chip.roundRect(-text.width / 2 - 8, -text.height / 2 - 4, text.width + 16, text.height + 8, 8).fill(p.gold);
    const reading = new Container();
    reading.addChild(chip, text);
    reading.position.set(at.x, at.y);
    reading.scale.set(1 / this.view.zoom);
    this.toolLayer.addChild(g, reading);
  }

  private drawLocalPointer(scenePoint: Point): void {
    this.pointerLayer.children.filter((c) => c.label === "local").forEach((c) => { c.destroy({ children: true }); });
    this.pointerLayer.addChild(this.pointerNode("local", scenePoint, this.palette.gold, ""));
  }

  private pointerNode(label: string, at: Point, color: number, name: string): Container {
    const p = this.palette;
    const node = new Container();
    node.label = label;
    node.position.set(at.x, at.y);
    node.scale.set(1 / this.view.zoom);
    const dot = new Graphics();
    dot.circle(0, 0, 9).fill({ color, alpha: 0.35 }).circle(0, 0, 5).fill(color).stroke({ width: 1.5, color: p.night });
    node.addChild(dot);
    if (name !== "") {
      const tag = new Text({ text: name, style: { fontFamily: p.ui, fontSize: 13, fontWeight: "600", fill: p.night } });
      tag.position.set(12, -8);
      const chip = new Graphics();
      chip.roundRect(10, -10, tag.width + 4, tag.height + 4, 4).fill(color);
      node.addChild(chip, tag);
    }
    return node;
  }

  /** The other people's pointers; the ones that have not moved for a while are taken away. */
  private drawPointers(force: boolean): void {
    const props = this.props;
    if (props === null) return;
    const live = livePointers(props.pointers, Date.now());
    const keys = live.map((q) => `${q.accountId}@${String(q.x)},${String(q.y)}`).join("|");
    if (!force && keys === this.pointerKeys) return;
    this.pointerKeys = keys;
    this.pointerLayer.children.filter((c) => c.label !== "local" || !this.pointerShown).forEach((c) => { c.destroy({ children: true }); });
    for (const q of live) this.pointerLayer.addChild(this.pointerNode(q.accountId, q, this.palette.tokens[colorOf(q.accountId)], q.username));
  }

  /** Tells where on the screen the selection is, so the bar that goes with it can sit right under it. */
  private reportAnchor(): void {
    const props = this.props;
    if (props === null || this.drag?.kind === "group") return;
    const chosen = props.tokens.filter((t) => props.selectedIds.has(t.id));
    if (chosen.length === 0) {
      this.sayAnchor(null);
      return;
    }
    let left = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const t of chosen) {
      const r = tokenRect(props.scene, t);
      left = Math.min(left, r.x);
      right = Math.max(right, r.x + r.w);
      bottom = Math.max(bottom, r.y + r.h);
    }
    const screen = { x: ((left + right) / 2) * this.view.zoom + this.view.panX, y: bottom * this.view.zoom + this.view.panY };
    this.sayAnchor(screen);
  }

  private sayAnchor(at: Point | null): void {
    if (samePoint(this.reportedAnchor, at)) return;
    this.reportedAnchor = at;
    this.callbacks.onAnchor(at);
  }

  destroy(): void {
    this.gone = true;
    this.hideLoupe();
    if (this.viewTimer !== null) clearTimeout(this.viewTimer);
    for (const stop of this.cleanup) stop();
    this.app.destroy(true, { children: true, texture: false });
  }
}
