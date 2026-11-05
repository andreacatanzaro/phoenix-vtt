import { useState, type ChangeEvent } from "react";
import { firstFreeSpot, MAX_TOKEN_SIZE, TEXT_MAX_LENGTH, TOKEN_COLORS, TOKEN_LABEL_MAX_LENGTH, t, type TableCommand, type TableScene, type TokenColor, type TokenView } from "@phoenix/shared";
import { api } from "./api";
import { Icon } from "./Icons";
import { useGuarded } from "./useGuarded";
import type { Me } from "./table/state";

type Person = { accountId: string; username: string };

type Props = {
  worldId: string;
  scene: TableScene;
  me: Me;
  tokens: readonly TokenView[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  people: readonly Person[];
  send: (command: TableCommand) => boolean;
};

const STEPS = [
  { key: "up", dx: 0, dy: -1 },
  { key: "left", dx: -1, dy: 0 },
  { key: "right", dx: 1, dy: 0 },
  { key: "down", dx: 0, dy: 1 },
] as const;

function Dot({ color, hidden }: { color: TokenColor; hidden?: boolean }) {
  return <span className={`dot ${color}${hidden === true ? " dim" : ""}`} aria-hidden="true" />;
}

export function ColorSelect({ value, onChange }: { value: TokenColor; onChange: (c: TokenColor) => void }) {
  return (
    <label className="field">
      {t("ui.world.table.token.color")}
      <select value={value} onChange={(e) => { onChange(TOKEN_COLORS.find((c) => c === e.target.value) ?? "gold"); }}>
        {TOKEN_COLORS.map((c) => (
          <option key={c} value={c}>{t(`ui.world.table.token.colors.${c}`)}</option>
        ))}
      </select>
    </label>
  );
}

function OwnerSelect({ value, people, onChange }: { value: string | null; people: readonly Person[]; onChange: (id: string | null) => void }) {
  return (
    <label className="field">
      {t("ui.world.table.token.owner")}
      <select value={value ?? ""} onChange={(e) => { onChange(e.target.value === "" ? null : e.target.value); }}>
        <option value="">{t("ui.world.table.token.no-owner")}</option>
        {people.map((p) => (
          <option key={p.accountId} value={p.accountId}>{p.username}</option>
        ))}
      </select>
    </label>
  );
}

export function SizeSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="field">
      {t("ui.world.table.token.size")}
      <select value={value} onChange={(e) => { onChange(Number(e.target.value)); }}>
        {Array.from({ length: MAX_TOKEN_SIZE }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}

/** Uploads a token picture and gives back its id, or null when none was chosen. */
export function PictureInput({ worldId, onPicked, error, run }: { worldId: string; onPicked: (id: string) => void; error: string | null; run: (a: () => Promise<void>) => Promise<boolean> }) {
  const choose = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file === undefined) return;
    await run(async () => {
      onPicked((await api.uploadImage(worldId, "token", file)).id);
    });
  };
  return (
    <label className="field">
      {t("ui.world.table.token.picture")}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void choose(e)} />
      {error !== null && <span className="error small" role="alert">{error}</span>}
    </label>
  );
}

function AddToken({ worldId, scene, tokens, people, send }: { worldId: string; scene: TableScene; tokens: readonly TokenView[]; people: readonly Person[]; send: Props["send"] }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<TokenColor>("gold");
  const [size, setSize] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [travels, setTravels] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const guard = useGuarded();

  const add = (): void => {
    const name = label.trim();
    if (name === "") return;
    // A new token appears in the first free square of the start zone, so it never lands on another.
    // Only figures take a square: a text lying there does not keep a token out.
    const spot = firstFreeSpot(scene.start, size, tokens.filter((tk) => tk.kind === "token"));
    if (send({ type: "token.add", kind: "token", label: name, color, x: spot.x, y: spot.y, size, hidden, travels, ownerAccountId: owner, imageId })) {
      // What is specific to one token must not carry over to the next (a Goblin is not Aldric's).
      setLabel("");
      setImageId(null);
      setOwner(null);
      setHidden(false);
      setTravels(false);
    }
  };

  return (
    <form className="stack tight" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <h3>{t("ui.world.table.token.new")}</h3>
      <label className="field">
        {t("ui.world.table.token.label")}
        <input value={label} maxLength={40} onChange={(e) => { setLabel(e.target.value); }} />
      </label>
      <div className="form-grid">
        <ColorSelect value={color} onChange={setColor} />
        <SizeSelect value={size} onChange={setSize} />
      </div>
      <OwnerSelect value={owner} people={people} onChange={setOwner} />
      <PictureInput worldId={worldId} onPicked={setImageId} error={guard.error} run={guard.run} />
      {imageId !== null && <p className="muted small">{t("ui.world.table.token.picture")} ✓</p>}
      <label className="switch"><input type="checkbox" checked={hidden} onChange={(e) => { setHidden(e.target.checked); }} />{t("ui.world.table.token.hidden")}</label>
      <label className="switch"><input type="checkbox" checked={travels} onChange={(e) => { setTravels(e.target.checked); }} />{t("ui.world.table.token.travels")}</label>
      <button type="submit" className="btn">{t("ui.world.table.token.add")}</button>
    </form>
  );
}

/** Writing a text on the map without the mouse: the words go to the start zone, where the DM moves them from the list. */
function AddText({ scene, tokens, send }: { scene: TableScene; tokens: readonly TokenView[]; send: Props["send"] }) {
  const [text, setText] = useState("");
  const write = (): void => {
    const words = text.trim();
    if (words === "") return;
    const spot = firstFreeSpot(scene.start, 1, tokens.map((tk) => ({ x: tk.x, y: tk.y, size: 1 })));
    if (send({ type: "token.add", kind: "text", label: words, color: "gold", x: spot.x, y: spot.y, size: 1, hidden: false, travels: false, ownerAccountId: null, imageId: null })) setText("");
  };
  return (
    <form className="stack tight" onSubmit={(e) => { e.preventDefault(); write(); }}>
      <h3>{t("ui.world.table.token.new-text")}</h3>
      <label className="field">
        {t("ui.world.table.draft.text")}
        <input value={text} maxLength={TEXT_MAX_LENGTH} onChange={(e) => { setText(e.target.value); }} />
      </label>
      <button type="submit" className="btn quiet">{t("ui.world.table.draft.confirm")}</button>
    </form>
  );
}

function Details({ token, worldId, me, people, send, onClose }: { token: TokenView; worldId: string; me: Me; people: readonly Person[]; send: Props["send"]; onClose: () => void }) {
  const isDm = me.role === "dm";
  const canMove = isDm || token.ownerAccountId === me.accountId;
  const guard = useGuarded();
  const [name, setName] = useState(token.label);
  const update = (changes: { hidden?: boolean; travels?: boolean; color?: TokenColor; size?: number; ownerAccountId?: string | null; imageId?: string }): void => {
    send({ type: "token.update", tokenId: token.id, ...changes });
  };
  return (
    <section className="stack tight" aria-label={t("ui.world.table.token.selected")}>
      <h3 className="row"><Dot color={token.color} hidden={token.hidden} />{token.label}</h3>
      <p className="muted small">{t("ui.world.table.token.position", { x: token.x, y: token.y })}</p>
      {isDm && (
        <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); const label = name.trim(); if (label !== "" && label !== token.label) send({ type: "token.update", tokenId: token.id, label }); }}>
          <input value={name} maxLength={token.kind === "text" ? TEXT_MAX_LENGTH : TOKEN_LABEL_MAX_LENGTH} aria-label={t("ui.world.table.token.label")} onChange={(e) => { setName(e.target.value); }} />
          <button type="submit" className="btn quiet small">{t("ui.world.table.token.rename")}</button>
        </form>
      )}
      {canMove && (
        <div className="dpad" role="group" aria-label={t("ui.world.table.token.title")}>
          {STEPS.map((s) => (
            <button key={s.key} type="button" className={`btn quiet small ${s.key}`} aria-label={t("ui.world.table.token.move", { direction: t(`ui.world.table.token.directions.${s.key}`) })} onClick={() => { send({ type: "token.move", tokenId: token.id, x: token.x + s.dx, y: token.y + s.dy }); }}>
              {{ up: "▲", left: "◀", right: "▶", down: "▼" }[s.key]}
            </button>
          ))}
        </div>
      )}
      {isDm && (
        <>
          <div className="row">
            <span className={token.hidden ? "vis" : "vis on"} aria-hidden="true" />
            <span>{token.hidden ? t("ui.world.table.token.hidden") : t("ui.world.table.token.shown")}</span>
            <button type="button" className="btn quiet small" onClick={() => { update({ hidden: !token.hidden }); }}>
              {token.hidden ? t("ui.world.table.token.show") : t("ui.world.table.token.hide")}
            </button>
          </div>
          {token.kind === "token" && (
            <>
              <div className="form-grid">
                <ColorSelect value={token.color} onChange={(color) => { update({ color }); }} />
                <SizeSelect value={token.size} onChange={(size) => { update({ size }); }} />
              </div>
              <OwnerSelect value={token.ownerAccountId} people={people} onChange={(ownerAccountId) => { update({ ownerAccountId }); }} />
              <PictureInput worldId={worldId} onPicked={(imageId) => { update({ imageId }); }} error={guard.error} run={guard.run} />
            </>
          )}
          {token.kind === "token" && <label className="switch"><input type="checkbox" checked={token.travels} onChange={(e) => { update({ travels: e.target.checked }); }} />{t("ui.world.table.token.travels")}</label>}
          <button type="button" className="btn danger" onClick={() => { send({ type: "token.remove", tokenId: token.id }); onClose(); }}>{t("ui.world.table.token.remove")}</button>
        </>
      )}
    </section>
  );
}

/** The details of one token (name, position, and for the DM everything that can be changed). */
export function TokenDetailsPanel({ token, worldId, me, people, send, onClose }: { token: TokenView; worldId: string; me: Me; people: readonly Person[]; send: Props["send"]; onClose: () => void }) {
  return (
    <section className="panel hud-panel" aria-label={t("ui.world.table.hud.details")}>
      <h2 className="section-title">{t("ui.world.table.hud.details")}</h2>
      <Details key={token.id} token={token} worldId={worldId} me={me} people={people} send={send} onClose={onClose} />
    </section>
  );
}

/** The tokens of the scene, to pick from a list (and so reachable without the mouse), and for the DM the form to add more. */
export function TokensPanel({ worldId, scene, me, tokens, selectedIds, onSelect, people, send }: { worldId: string; scene: TableScene; me: Me; tokens: readonly TokenView[]; selectedIds: ReadonlySet<string>; onSelect: (id: string) => void; people: readonly Person[]; send: Props["send"] }) {
  return (
    <section className="panel hud-panel" aria-label={t("ui.world.table.token.title")}>
      <h2 className="section-title">{t("ui.world.table.token.title")}</h2>
      {tokens.length === 0 ? (
        <p className="muted small">{t("ui.world.table.token.none")}</p>
      ) : (
        <ul className="token-list" aria-label={t("ui.world.table.token.list")}>
          {tokens.map((tk) => (
            <li key={tk.id}>
              <button type="button" className="tree-pick" aria-current={selectedIds.has(tk.id) ? "true" : undefined} aria-label={t("ui.world.table.token.select", { name: tk.label })} onClick={() => { onSelect(tk.id); }}>
                {tk.kind === "text" ? <Icon name="text" /> : <Dot color={tk.color} hidden={tk.hidden} />}
                <span className="label">{tk.label}</span>
                {tk.ownerAccountId === me.accountId && <span className="badge gold">{t("ui.world.table.token.mine")}</span>}
                {me.role === "dm" && <span className={tk.hidden ? "vis" : "vis on"} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {me.role === "dm" && <AddToken worldId={worldId} scene={scene} tokens={tokens} people={people} send={send} />}
      {me.role === "dm" && <AddText scene={scene} tokens={tokens} send={send} />}
    </section>
  );
}
