import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { t, type ElementCollection, type SceneLinkView, type WorldTree } from "@phoenix/shared";
import { api, ApiFailure } from "./api";
import { CHILD_OF, branches, indexTree, sceneOptions, type Branch, type Entry } from "./tree";
import { useGuarded } from "./useGuarded";

/** Structure of a world: the tree on the left, what is selected on the right. The DM edits; a player only reads. */
export function AtlasPanel({ worldId, isDm }: { worldId: string; isDm: boolean }) {
  const [tree, setTree] = useState<WorldTree | null>(null);
  const [links, setLinks] = useState<SceneLinkView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const { error, run } = useGuarded();

  const reload = useCallback(async () => {
    await run(async () => {
      const [loaded, exits] = await Promise.all([api.tree(worldId), isDm ? api.sceneLinks(worldId) : Promise.resolve([])]);
      setTree(loaded);
      setLinks(exits);
    });
  }, [worldId, isDm]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const index = useMemo(() => (tree === null ? new Map<string, Entry>() : indexTree(tree)), [tree]);
  const current = selected === null ? undefined : index.get(selected);
  // The first region is shown until something else is picked, or when what was picked is gone.
  const shown = current ?? (tree?.regions[0] === undefined ? undefined : index.get(tree.regions[0].id));

  if (tree === null) return <p className="muted">{error ?? t("ui.loading")}</p>;

  const toggle = (id: string): void => {
    setFolded((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  return (
    <div className="stack">
      {error !== null && <p role="alert" className="notice">{error}</p>}
      <div className="atlas">
        <nav className="tree-panel tree" aria-label={t("ui.world.tabs.structure")}>
          {tree.regions.length === 0 && <p className="muted small" style={{ padding: "0.5rem" }}>{isDm ? t("ui.world.structure.empty-dm") : t("ui.world.structure.empty")}</p>}
          <ul className="root">
            {branches(tree).map((branch) => (
              <TreeItem key={branch.node.id} branch={branch} collection="regions" isDm={isDm} selectedId={shown?.node.id ?? null} folded={folded} onPick={setSelected} onToggle={toggle} />
            ))}
          </ul>
          {isDm && <div className="tree-add"><AddForm worldId={worldId} collection="regions" onDone={reload} onCreated={setSelected} /></div>}
        </nav>
        <div>
          {shown !== undefined ? (
            <Detail
              key={shown.node.id}
              worldId={worldId}
              entry={shown}
              isDm={isDm}
              links={links}
              tree={tree}
              onPick={setSelected}
              onChange={reload}
              onGone={() => { setSelected(shown.parentId); }}
            />
          ) : (
            <p className="muted">{t("ui.world.structure.pick")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeItem({ branch, collection, isDm, selectedId, folded, onPick, onToggle }: { branch: Branch; collection: ElementCollection; isDm: boolean; selectedId: string | null; folded: ReadonlySet<string>; onPick: (id: string) => void; onToggle: (id: string) => void }) {
  const child = CHILD_OF[collection];
  const hasChildren = branch.children.length > 0 && child !== null;
  const open = !folded.has(branch.node.id);
  return (
    <li>
      <div className="tree-row">
        {hasChildren ? (
          <button type="button" className="fold" aria-expanded={open} aria-label={t("ui.world.structure.fold", { name: branch.node.name })} onClick={() => { onToggle(branch.node.id); }}>
          </button>
        ) : (
          <span className="spacer" />
        )}
        <button type="button" className="tree-pick" aria-current={selectedId === branch.node.id} onClick={() => { onPick(branch.node.id); }}>
          {isDm && <span className={branch.node.revealed ? "vis on" : "vis"} role="img" aria-label={branch.node.revealed ? t("ui.world.structure.visible") : t("ui.world.structure.hidden")} />}
          <span className={`label ${collection === "regions" ? "region" : collection === "scenes" ? "scene" : ""}`}>{branch.node.name}</span>
        </button>
      </div>
      {hasChildren && open && (
        <ul>
          {branch.children.map((c) => (
            <TreeItem key={c.node.id} branch={c} collection={child} isDm={isDm} selectedId={selectedId} folded={folded} onPick={onPick} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Detail({ worldId, entry, isDm, links, tree, onPick, onChange, onGone }: { worldId: string; entry: Entry; isDm: boolean; links: SceneLinkView[]; tree: WorldTree; onPick: (id: string) => void; onChange: () => Promise<void>; onGone: () => void }) {
  const { error, run } = useGuarded();
  const { node, collection } = entry;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description);
  const [notes, setNotes] = useState(node.dmNotes ?? "");
  // A scene that still has tokens is deleted only after the DM has said so, with the tokens.
  const [askAboutTokens, setAskAboutTokens] = useState(false);
  const child = CHILD_OF[collection];

  async function remove(withTokens: boolean): Promise<void> {
    setAskAboutTokens(false);
    const outcome: { gone: boolean; asked: boolean } = { gone: false, asked: false };
    await run(async () => {
      try {
        await api.deleteElement(worldId, collection, node.id, { withTokens });
        outcome.gone = true;
      } catch (e) {
        if (e instanceof ApiFailure && e.key === "errors.world.scene-has-tokens" && !withTokens) {
          setAskAboutTokens(true);
          outcome.asked = true;
          return;
        }
        throw e;
      }
    });
    if (outcome.gone) onGone();
    // Nothing changed while the question is open, so there is nothing to reload; every other outcome refreshes the tree.
    if (!outcome.asked) await onChange();
  }

  async function save(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    if (await run(() => api.updateElement(worldId, collection, node.id, { name, description, dmNotes: notes }).then(() => undefined))) {
      setEditing(false);
      await onChange();
    }
  }

  return (
    <article className="detail framed">
      <header className="detail-head">
        {entry.path.length > 1 && <p className="where">{entry.path.slice(0, -1).join(" › ")}</p>}
        <p className="muted small">{t(`ui.world.kind.${collection}`)}</p>
        <h2>{node.name}</h2>
      </header>

      {node.description !== "" && <p className="flavor">{node.description}</p>}
      {isDm && node.dmNotes !== undefined && node.dmNotes !== "" && (
        <p className="dm-note">
          <span className="tag">{t("ui.world.structure.dm-only")}</span>
          {node.dmNotes}
        </p>
      )}

      {isDm && (
        <div className="row">
          <label className="switch">
            <input
              type="checkbox"
              checked={node.revealed}
              onChange={(e) => {
                void run(() => api.updateElement(worldId, collection, node.id, { revealed: e.target.checked }).then(() => undefined)).then(onChange);
              }}
            />
            {node.revealed ? t("ui.world.structure.visible") : t("ui.world.structure.hidden")}
          </label>
          <button type="button" className="btn quiet small" onClick={() => { setEditing(!editing); }}>{editing ? t("ui.world.structure.cancel") : t("ui.world.structure.edit")}</button>
          <button
            type="button"
            className="btn danger small"
            onClick={() => { void remove(false); }}
          >
            {t("ui.world.structure.delete")}
          </button>
        </div>
      )}
      {askAboutTokens && (
        <div className="notice stack tight" role="alertdialog" aria-label={t("ui.world.structure.confirm-scene-tokens")}>
          <p>{t("ui.world.structure.confirm-scene-tokens")}</p>
          <div className="row">
            <button type="button" className="btn danger small" onClick={() => { void remove(true); }}>{t("ui.world.structure.confirm-delete")}</button>
            <button type="button" className="btn quiet small" onClick={() => { setAskAboutTokens(false); }}>{t("ui.world.structure.keep-scene")}</button>
          </div>
        </div>
      )}
      {error !== null && <p role="alert" className="notice">{error}</p>}

      {editing && (
        <form className="panel stack" onSubmit={(e) => void save(e)}>
          <label className="field">{t("ui.world.structure.name")}<input value={name} onChange={(e) => { setName(e.target.value); }} maxLength={120} required /></label>
          <label className="field">{t("ui.world.structure.description")}<textarea value={description} onChange={(e) => { setDescription(e.target.value); }} /></label>
          <label className="field">{t("ui.world.structure.notes")}<textarea value={notes} onChange={(e) => { setNotes(e.target.value); }} /></label>
          <div><button type="submit" className="btn">{t("ui.world.structure.save")}</button></div>
        </form>
      )}

      {(entry.children.length > 0 || (isDm && child !== null)) && child !== null && (
        <section>
          <h3 className="section-title">{t("ui.world.structure.contains")}</h3>
          <ul className="child-list">
            {entry.children.map((c) => (
              <li key={c.id}>
                <button type="button" className="btn text" onClick={() => { onPick(c.id); }}>{c.name}</button>
              </li>
            ))}
          </ul>
          {isDm && <div style={{ marginTop: "0.75rem" }}><AddForm worldId={worldId} collection={child} parentId={node.id} onDone={onChange} onCreated={onPick} /></div>}
        </section>
      )}

      {isDm && collection === "scenes" && <Exits worldId={worldId} sceneId={node.id} links={links} tree={tree} onChange={onChange} />}
    </article>
  );
}

/** The ways out of a scene. Any other scene of the world can be the destination, in any place, area or region. */
function Exits({ worldId, sceneId, links, tree, onChange }: { worldId: string; sceneId: string; links: SceneLinkView[]; tree: WorldTree; onChange: () => Promise<void> }) {
  const scenes = sceneOptions(tree);
  const pathOf = (id: string): string => scenes.find((s) => s.id === id)?.path ?? id;
  const mine = links.filter((l) => l.fromSceneId === sceneId);
  const [to, setTo] = useState("");
  const [label, setLabel] = useState("");
  const { error, run } = useGuarded();

  async function add(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    if (await run(() => api.createSceneLink(worldId, { fromSceneId: sceneId, toSceneId: to, label }).then(() => undefined))) {
      setTo("");
      setLabel("");
      await onChange();
    }
  }

  return (
    <section>
      <h3 className="section-title">{t("ui.world.exits.title")}</h3>
      {mine.length === 0 ? (
        <p className="muted">{t("ui.world.exits.none")}</p>
      ) : (
        <ul>
          {mine.map((link) => (
            <li key={link.id} className="exit">
              <span>
                {link.label !== "" && <span className="via">{link.label} </span>}
                <span className="muted">{t("ui.world.exits.toward")}</span> {pathOf(link.toSceneId)}
              </span>
              <button type="button" className="btn danger small" onClick={() => { void run(() => api.deleteSceneLink(worldId, link.id)).then(onChange); }}>{t("ui.world.exits.remove")}</button>
            </li>
          ))}
        </ul>
      )}
      {scenes.length < 2 ? (
        <p className="muted small">{t("ui.world.exits.need")}</p>
      ) : (
        <form className="stack" style={{ marginTop: "0.75rem" }} onSubmit={(e) => void add(e)}>
          <div className="form-grid">
            <label className="field">
              {t("ui.world.exits.to")}
              <select value={to} onChange={(e) => { setTo(e.target.value); }} required>
                <option value="">{t("ui.world.exits.choose")}</option>
                {scenes.filter((s) => s.id !== sceneId).map((s) => <option key={s.id} value={s.id}>{s.path}</option>)}
              </select>
            </label>
            <label className="field">
              {t("ui.world.exits.label")}
              <input value={label} onChange={(e) => { setLabel(e.target.value); }} maxLength={120} />
            </label>
          </div>
          <div><button type="submit" className="btn quiet">{t("ui.world.exits.add")}</button></div>
        </form>
      )}
      {error !== null && <p role="alert" className="notice">{error}</p>}
    </section>
  );
}

function AddForm({ worldId, collection, parentId, onDone, onCreated }: { worldId: string; collection: ElementCollection; parentId?: string; onDone: () => Promise<void>; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const { error, run } = useGuarded();

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    let createdId = "";
    const ok = await run(async () => {
      const created = await api.createElement(worldId, collection, { name, ...(parentId === undefined ? {} : { parentId }) });
      createdId = created.id;
    });
    if (ok) {
      setName("");
      await onDone();
      onCreated(createdId);
    }
  }

  return (
    <form className="row" onSubmit={(e) => void submit(e)}>
      <input style={{ flex: 1, minWidth: "9rem", width: "auto" }} aria-label={t(`ui.world.new.${collection}`)} placeholder={t(`ui.world.new.${collection}`)} value={name} onChange={(e) => { setName(e.target.value); }} maxLength={120} required />
      <button type="submit" className="btn quiet small">{t("ui.world.structure.add")}</button>
      {error !== null && <span role="alert" className="error small">{error}</span>}
    </form>
  );
}
