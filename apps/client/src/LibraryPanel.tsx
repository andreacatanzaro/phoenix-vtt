import { useCallback, useEffect, useRef, useState } from "react";
import { firstFreeSpot, t, TOKEN_LABEL_MAX_LENGTH, type LibraryTokenView, type TableCommand, type TableScene, type TokenColor, type TokenView } from "@phoenix/shared";
import { api } from "./api";
import { ColorSelect, PictureInput, SizeSelect } from "./TokenPanel";
import { useGuarded } from "./useGuarded";

type Props = {
  worldId: string;
  scene: TableScene;
  /** What is on the scene now, so a copy goes to a square that is free. */
  tokens: readonly TokenView[];
  send: (command: TableCommand) => boolean;
};

type Values = { name: string; color: TokenColor; size: number; imageId: string | null | undefined };

/** The fields of an entry of the library: a name, a colour, a size, and a picture (uploaded when it is chosen). */
function EntryForm({ worldId, initial, hasPicture = false, submit, label, onCancel }: { worldId: string; initial: Values; /** The entry has a picture already (the picture itself is not in `initial`, which only says whether it changed). */ hasPicture?: boolean; submit: (values: Values) => Promise<void>; label: string; onCancel?: () => void }) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState<TokenColor>(initial.color);
  const [size, setSize] = useState(initial.size);
  // undefined: the picture is as it was; null: taken away; a string: a new one, already uploaded.
  const [imageId, setImageId] = useState<string | null | undefined>(initial.imageId);
  const guard = useGuarded();

  const send = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    await submit({ name: trimmed, color, size, imageId });
  };

  return (
    <form className="stack tight" aria-label={label} onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <label className="field">
        {t("ui.world.table.token.label")}
        <input value={name} maxLength={TOKEN_LABEL_MAX_LENGTH} onChange={(e) => { setName(e.target.value); }} />
      </label>
      <div className="form-grid">
        <ColorSelect value={color} onChange={setColor} />
        <SizeSelect value={size} onChange={setSize} />
      </div>
      <PictureInput worldId={worldId} onPicked={setImageId} error={guard.error} run={guard.run} />
      {typeof imageId === "string" && <p className="muted small">{t("ui.world.table.library.picture-ok")}</p>}
      {onCancel !== undefined && hasPicture && imageId !== null && (
        <button type="button" className="btn quiet small" onClick={() => { setImageId(null); }}>{t("ui.world.table.library.remove-picture")}</button>
      )}
      <div className="row">
        <button type="submit" className="btn small">{onCancel === undefined ? t("ui.world.table.library.create") : t("ui.world.table.library.save")}</button>
        {onCancel !== undefined && <button type="button" className="btn quiet small" onClick={onCancel}>{t("ui.world.table.library.cancel")}</button>}
      </div>
    </form>
  );
}

/**
 * The token library of the world, the DM's: load a token once, then put it on a scene as many times as needed, at the
 * table and in the preparation. What is put on a scene is a copy of the entry, so changing or removing the entry leaves
 * the tokens already there alone.
 */
export function LibraryPanel({ worldId, scene, tokens, send }: Props) {
  const [entries, setEntries] = useState<LibraryTokenView[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // The form for a new entry begins again, empty, after each one is made.
  const [fresh, setFresh] = useState(0);
  // Copies asked for that the table has not answered yet: they take a square, so the next one does not land on them.
  const pending = useRef<{ x: number; y: number; size: number }[]>([]);
  useEffect(() => { pending.current = []; }, [scene.id]);
  const { error, run } = useGuarded();

  const load = useCallback(async (): Promise<void> => {
    await run(async () => { setEntries(await api.tokenLibrary(worldId)); });
  }, [worldId]);
  useEffect(() => { void load(); }, [load]);

  /** A copy of the entry goes to the first free square of the start zone, as every new token does. */
  const put = (entry: LibraryTokenView): void => {
    const figures = tokens.filter((tk) => tk.kind === "token");
    // A copy the table has answered is among the tokens now; the others still wait.
    pending.current = pending.current.filter((p) => !figures.some((tk) => tk.x === p.x && tk.y === p.y));
    const spot = firstFreeSpot(scene.start, entry.size, [...figures, ...pending.current]);
    if (send({ type: "token.add", kind: "token", label: entry.name, color: entry.color, x: spot.x, y: spot.y, size: entry.size, hidden, travels: false, ownerAccountId: null, imageId: entry.imageId })) {
      pending.current.push({ x: spot.x, y: spot.y, size: entry.size });
    }
  };

  const create = async (values: Values): Promise<void> => {
    if (await run(async () => { await api.createLibraryToken(worldId, { name: values.name, color: values.color, size: values.size, imageId: values.imageId ?? null }); })) {
      setFresh((n) => n + 1);
      await load();
    }
  };

  const change = async (entry: LibraryTokenView, values: Values): Promise<void> => {
    const ok = await run(async () => {
      await api.updateLibraryToken(worldId, entry.id, { name: values.name, color: values.color, size: values.size, ...(values.imageId === undefined ? {} : { imageId: values.imageId }) });
    });
    if (ok) {
      setEditing(null);
      await load();
    }
  };

  const remove = async (entry: LibraryTokenView): Promise<void> => {
    if (await run(async () => { await api.deleteLibraryToken(worldId, entry.id); })) await load();
  };

  return (
    <section className="panel hud-panel wide" aria-label={t("ui.world.table.library.title")}>
      <h2 className="section-title">{t("ui.world.table.library.title")}</h2>
      {entries !== null && entries.length === 0 && <p className="muted small">{t("ui.world.table.library.empty")}</p>}
      {entries !== null && entries.length > 0 && (
        <>
          <label className="switch"><input type="checkbox" checked={hidden} onChange={(e) => { setHidden(e.target.checked); }} />{t("ui.world.table.library.hidden")}</label>
          <ul className="child-list">
            {entries.map((entry) => (
              <li key={entry.id} className="stack tight">
                {editing === entry.id ? (
                  <EntryForm
                    worldId={worldId}
                    label={t("ui.world.table.library.edit", { name: entry.name })}
                    initial={{ name: entry.name, color: entry.color, size: entry.size, imageId: undefined }}
                    hasPicture={entry.imageId !== null}
                    submit={(values) => change(entry, values)}
                    onCancel={() => { setEditing(null); }}
                  />
                ) : (
                  <div className="row">
                    <span className={`dot ${entry.color}`} aria-hidden="true" />
                    <span>{entry.name}</span>
                    <span className="muted small">{t("ui.world.table.library.size", { size: String(entry.size) })}</span>
                    <button type="button" className="btn small" aria-label={t("ui.world.table.library.add", { name: entry.name })} onClick={() => { put(entry); }}>{t("ui.world.table.token.add")}</button>
                    <button type="button" className="btn quiet small" aria-label={t("ui.world.table.library.edit", { name: entry.name })} onClick={() => { setEditing(entry.id); }}>{t("ui.world.structure.edit")}</button>
                    <button type="button" className="btn danger small" aria-label={t("ui.world.table.library.remove", { name: entry.name })} onClick={() => { void remove(entry); }}>{t("ui.world.structure.delete")}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">{t("ui.world.table.library.note")}</p>
        </>
      )}
      <h3>{t("ui.world.table.library.new")}</h3>
      <EntryForm key={fresh} worldId={worldId} label={t("ui.world.table.library.new")} initial={{ name: "", color: "gold", size: 1, imageId: null }} submit={create} />
      {error !== null && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
