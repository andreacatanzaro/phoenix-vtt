import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { TableScene, TokenView } from "@phoenix/shared";
import { boardSize, cellAt, clampCell, fitView, panBy, toScene, tokenAt, tokenRect, zoomAt, type Point, type View } from "./geometry";
import { readPalette, type Palette } from "./palette";
import { TextureCache } from "./texture-cache";

export type BoardProps = {
  scene: TableScene;
  tokens: readonly TokenView[];
  /** Who looks: the DM moves every token, a player only their own. */
  me: { accountId: string; role: "dm" | "player" };
  selectedId: string | null;
  showStart: boolean;
  /** The address a picture of this world is loaded from. */
  imageUrl: (imageId: string) => string;
  /** Goes up when the server refused something, so tokens dragged by hand return to where the server has them. */
  revision: number;
};

export type BoardCallbacks = {
  onSelect: (tokenId: string | null) => void;
  onMove: (tokenId: string, x: number, y: number) => void;
};

type Drag = { kind: "token"; token: TokenView; grab: Point; node: Container } | { kind: "pan"; last: Point } | null;

const WHEEL_STEP = 0.0015;
const MIN_FONT = 11;

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
 * The picture of the table: the map, the grid and the tokens, drawn with PixiJS inside `host`. It knows nothing about
 * the network: it shows what it is given and reports what the person did (select, move) through the callbacks.
 */
export class BoardView {
  private readonly world = new Container();
  private readonly mapLayer = new Container();
  private readonly gridLayer = new Graphics();
  private readonly startLayer = new Graphics();
  private readonly tokenLayer = new Container();
  private readonly palette: Palette;
  private readonly textures = new TextureCache<Texture>(() => Date.now());
  private view: View = { zoom: 1, panX: 0, panY: 0 };
  private props: BoardProps | null = null;
  private drag: Drag = null;
  private fittedFor: string | null = null;
  private mapFor: string | null = null;
  /** Whether the map picture of the current scene is on the board; if not, every update tries again. */
  private mapReady = false;
  private gone = false;
  private readonly cleanup: (() => void)[] = [];

  private constructor(
    private readonly app: Application,
    private readonly host: HTMLElement,
    private readonly callbacks: BoardCallbacks,
  ) {
    this.palette = readPalette();
    this.world.addChild(this.mapLayer, this.gridLayer, this.startLayer, this.tokenLayer);
    app.stage.addChild(this.world);
    this.listen();
  }

  static async create(host: HTMLElement, callbacks: BoardCallbacks): Promise<BoardView> {
    const palette = readPalette();
    const app = new Application();
    await app.init({ resizeTo: host, background: palette.night, antialias: true, autoDensity: true, resolution: window.devicePixelRatio });
    host.appendChild(app.canvas);
    return new BoardView(app, host, callbacks);
  }

  private local(e: { clientX: number; clientY: number }): Point {
    const box = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
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
      const scenePoint = toScene(this.view, at);
      const hit = tokenAt(props.scene, props.tokens, scenePoint);
      this.callbacks.onSelect(hit?.id ?? null);
      if (hit === null) {
        this.drag = { kind: "pan", last: at };
        return;
      }
      const node = this.tokenLayer.children.find((c) => c.label === hit.id);
      if (node === undefined || !(props.me.role === "dm" || hit.ownerAccountId === props.me.accountId)) {
        this.drag = { kind: "pan", last: at };
        return;
      }
      const rect = tokenRect(props.scene, hit);
      this.drag = { kind: "token", token: hit, grab: { x: scenePoint.x - rect.x, y: scenePoint.y - rect.y }, node };
    });

    on("pointermove", (e) => {
      const props = this.props;
      if (this.drag === null || props === null) return;
      const at = this.local(e);
      if (this.drag.kind === "pan") {
        this.view = panBy(this.view, this.drag.last, at);
        this.drag.last = at;
        this.applyView();
        return;
      }
      const p = toScene(this.view, at);
      this.drag.node.position.set(p.x - this.drag.grab.x, p.y - this.drag.grab.y);
    });

    const finish = (e: PointerEvent): void => {
      const props = this.props;
      const drag = this.drag;
      this.drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (drag?.kind !== "token" || props === null) return;
      const p = toScene(this.view, this.local(e));
      const half = (drag.token.size * props.scene.gridPx) / 2;
      const cell = clampCell(cellAt(props.scene, { x: p.x - drag.grab.x + half, y: p.y - drag.grab.y + half }));
      // Over the middle of the square it lands on: a token of size 2 is placed by its top-left square.
      const target = clampCell({ x: cell.x - Math.floor(drag.token.size / 2), y: cell.y - Math.floor(drag.token.size / 2) });
      const rect = tokenRect(props.scene, { x: target.x, y: target.y, size: drag.token.size });
      drag.node.position.set(rect.x, rect.y);
      if (target.x !== drag.token.x || target.y !== drag.token.y) this.callbacks.onMove(drag.token.id, target.x, target.y);
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

    const observer = new ResizeObserver(() => {
      if (this.props !== null) this.fit();
    });
    observer.observe(this.host);
    this.cleanup.push(() => { observer.disconnect(); });
  }

  private applyView(): void {
    this.world.position.set(this.view.panX, this.view.panY);
    this.world.scale.set(this.view.zoom);
  }

  private fit(): void {
    const props = this.props;
    if (props === null) return;
    this.view = fitView(boardSize(props.scene), { w: this.app.screen.width, h: this.app.screen.height });
    this.applyView();
  }

  /** Shows the given state. Cheap enough to call on every change. */
  update(props: BoardProps): void {
    if (this.gone) return;
    const previous = this.props;
    this.props = props;
    const board = boardSize(props.scene);
    const fitKey = `${props.scene.id}:${String(board.w)}x${String(board.h)}`;
    if (this.fittedFor !== fitKey) {
      this.fittedFor = fitKey;
      this.fit();
    }
    const mapChanged = previous === null || previous.scene.mapImageId !== props.scene.mapImageId || previous.scene.id !== props.scene.id;
    if (mapChanged || (props.scene.mapImageId !== null && !this.mapReady)) void this.drawMap(props, mapChanged);
    this.drawGrid(props.scene);
    this.drawStart(props);
    this.drawTokens(props);
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
    const dragged = this.drag?.kind === "token" ? this.drag : null;
    const held = dragged === null ? null : { x: dragged.node.x, y: dragged.node.y };
    this.tokenLayer.removeChildren().forEach((c) => { c.destroy({ children: true }); });
    for (const token of props.tokens) this.tokenLayer.addChild(this.tokenNode(token, props));
    if (dragged === null || held === null) return;
    // Someone else's move arrived while a token is in hand: the drag goes on with the new picture.
    const node = this.tokenLayer.children.find((c) => c.label === dragged.token.id);
    if (node === undefined) {
      this.drag = null;
      return;
    }
    node.position.set(held.x, held.y);
    dragged.node = node;
  }

  private tokenNode(token: TokenView, props: BoardProps): Container {
    const p = this.palette;
    const rect = tokenRect(props.scene, token);
    const node = new Container();
    node.label = token.id;
    node.position.set(rect.x, rect.y);
    // The DM sees hidden tokens, dimmed: a player never receives them.
    if (token.hidden) node.alpha = 0.45;
    const radius = rect.w / 2;
    const selected = token.id === props.selectedId;
    const mine = token.ownerAccountId === props.me.accountId;

    const body = new Graphics();
    body.circle(radius, radius, radius - 3).fill(p.tokens[token.color]);
    body.circle(radius, radius, radius - 3).stroke({ width: selected ? 4 : 2, color: selected ? p.gold : mine ? p.gold : p.night, alpha: selected || mine ? 1 : 0.9 });
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

  destroy(): void {
    this.gone = true;
    for (const stop of this.cleanup) stop();
    this.app.destroy(true, { children: true, texture: false });
  }
}
