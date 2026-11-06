import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { t, type ElementCollection, type SceneLinkView, type WorldTree } from "@phoenix/shared";
import { api, ApiFailure, imageUrl } from "./api";
import { GraphCanvas, type GraphEdge, type GraphNode } from "./graph/GraphCanvas";
import { placeNodes } from "./graph/layout";
import { ancestors, indexTree, sceneOptions, type Entry } from "./tree";
import { useGuarded } from "./useGuarded";

/** The four levels of the structure, from the top: what the graph shows at each depth of the path. */
const LEVELS: readonly ElementCollection[] = ["regions", "areas", "places", "scenes"];

/** The strip, in pixels, the floating details cover on the right of the graph (30rem of panel and its margin). */
const DETAIL_CLEAR = 30 * 16 + 24;

/**
 * The structure of a world as a graph, in the way of a story builder: the regions are groups, a region holds areas, an
 * area holds places, a place holds scenes. A group is gone into; the path above says where you are. What is picked shows
 * its details on the right. The DM adds, moves and links; a player only walks it.
 * `onPrepare` opens the preparation of a scene (DM only): the table screen on that scene, without a session.
 */
export function AtlasPanel({ worldId, isDm, onPrepare }: { worldId: string; isDm: boolean; onPrepare: (sceneId: string) => void }) {
  const [tree, setTree] = useState<WorldTree | null>(null);
  const [links, setLinks] = useState<SceneLinkView[]>([]);
  // The groups gone into, from the region down; what is picked in the group being shown.
  const [path, setPath] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // The element just made: its details open already asking for the name. And how many were made, so the graph shows the new one.
  const [fresh, setFresh] = useState<string | null>(null);
  const [made, setMade] = useState(0);
  useEffect(() => { setFresh((f) => (f === selected ? f : null)); }, [selected]);
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
  // The path as far as it still holds: an element that was deleted ends it there.
  const here = useMemo(() => {
    const valid: string[] = [];
    for (const id of path) {
      const entry = index.get(id);
      if (entry === undefined || entry.parentId !== (valid.at(-1) ?? null) || entry.collection === "scenes") break;
      valid.push(id);
    }
    return valid;
  }, [path, index]);

  if (tree === null) return <p className="muted">{error ?? t("ui.loading")}</p>;

  const parentId = here.at(-1) ?? null;
  const level = LEVELS[here.length] ?? "scenes";
  const childIds = parentId === null ? tree.regions.map((r) => r.id) : (index.get(parentId)?.children ?? []).map((c) => c.id);
  const items = childIds.flatMap((id) => {
    const entry = index.get(id);
    return entry === undefined ? [] : [entry];
  });
  const positions = placeNodes(items.map((entry) => ({ id: entry.node.id, at: entry.node.graphX != null && entry.node.graphY != null ? { x: entry.node.graphX, y: entry.node.graphY } : null })));
  const nodes: GraphNode[] = items.map((entry) => ({
    id: entry.node.id,
    label: entry.node.name,
    shape: level === "scenes" ? "scene" : "group",
    level,
    at: positions.get(entry.node.id) ?? { x: 0, y: 0 },
    ...(level === "scenes" ? {} : { count: entry.children.length }),
    selected: selected === entry.node.id,
    hidden: isDm && !entry.node.revealed,
    imageSrc: level === "scenes" && entry.node.mapImageId != null ? imageUrl(worldId, entry.node.mapImageId) : null,
  }));
  // The exits between the scenes of this place are lines; the ones to other places are in the details of the scene.
  const shown = new Set(items.map((entry) => entry.node.id));
  const names = new Map(items.map((entry) => [entry.node.id, entry.node.name]));
  const edges: GraphEdge[] = level !== "scenes" ? [] : links.filter((l) => shown.has(l.fromSceneId) && shown.has(l.toSceneId)).map((l) => ({
    id: l.id,
    from: l.fromSceneId,
    to: l.toSceneId,
    label: l.label === "" ? t("ui.world.atlas.exit-label", { from: names.get(l.fromSceneId) ?? "", to: names.get(l.toSceneId) ?? "" }) : t("ui.world.atlas.exit-label-named", { from: names.get(l.fromSceneId) ?? "", to: names.get(l.toSceneId) ?? "", label: l.label }),
  }));

  /** Shows an element: the groups above it are gone into, and it is picked. */
  const goTo = (id: string): void => {
    const entry = index.get(id);
    if (entry === undefined) return;
    setPath(ancestors(index, id).map((a) => a.id));
    setSelected(id);
  };
  const detail = selected === null ? undefined : index.get(selected);
  /** Adds an element to the group being shown, at once, with a provisional name; the details open to ask for the real one. */
  const addHere = async (): Promise<void> => {
    const result: { id: string | null } = { id: null };
    const ok = await run(async () => { result.id = (await api.createElement(worldId, level, { name: t(`ui.world.new.${level}`), ...(parentId === null ? {} : { parentId }) })).id; });
    if (!ok || result.id === null) return;
    await reload();
    setMade((n) => n + 1);
    setFresh(result.id);
    setSelected(result.id);
  };
  const everything = [...index.values()];

  return (
    <div className="struct-root">
      {error !== null && <p role="alert" className="notice struct-notice">{error}</p>}
      <div className="graph-bar">
        <nav className="graph-path" aria-label={t("ui.world.graph.path")}>
          <button type="button" className="crumb" aria-current={here.length === 0 ? "location" : undefined} onClick={() => { setPath([]); setSelected(null); }}>{t("ui.world.graph.world")}</button>
          {here.map((id, i) => (
            <span key={id}>
              {" › "}
              <button type="button" className="crumb" aria-current={i === here.length - 1 ? "location" : undefined} onClick={() => { setPath(here.slice(0, i + 1)); setSelected(null); }}>{index.get(id)?.node.name ?? ""}</button>
            </span>
          ))}
        </nav>
        <div className="row">
          {isDm && <button type="button" className="btn small" onClick={() => { void addHere(); }}>{t(`ui.world.graph.add.${level}`)}</button>}
          {parentId !== null && <button type="button" className="btn quiet small" onClick={() => { setSelected(parentId); }}>{t("ui.world.graph.edit-group")}</button>}
          <label className="graph-find">
            <span className="sr-only">{t("ui.world.graph.find")}</span>
            <select value="" aria-label={t("ui.world.graph.find")} onChange={(e) => { if (e.target.value !== "") goTo(e.target.value); }}>
              <option value="">{t("ui.world.graph.find")}…</option>
              {everything.map((entry) => <option key={entry.node.id} value={entry.node.id}>{entry.path.join(" › ")}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="struct-layout">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          canEdit={isDm}
          fitKey={`${here.join("/")}#${String(made)}`}
          clearRight={detail === undefined ? 0 : DETAIL_CLEAR}
          empty={t(isDm ? "ui.world.graph.empty-dm" : "ui.world.graph.empty")}
          onSelect={setSelected}
          onEnter={(id) => { setPath([...here, id]); setSelected(null); }}
          onMove={(id, x, y) => { void run(async () => { await api.updateElement(worldId, level, id, { graphX: Math.round(x), graphY: Math.round(y) }); }).then((ok) => (ok ? reload() : undefined)); }}
          onEdge={(id) => { const link = links.find((l) => l.id === id); if (link !== undefined) setSelected(link.fromSceneId); }}
          onConnect={(from, to) => { void run(async () => { await api.createSceneLink(worldId, { fromSceneId: from, toSceneId: to, label: "" }); }).then((ok) => (ok ? reload() : undefined)); }}
        />
        {detail !== undefined && (
          <aside className="struct-detail floating" aria-label={t("ui.world.structure.detail")}>
            <button type="button" className="btn quiet small struct-close" aria-label={t("ui.world.structure.close")} onClick={() => { setSelected(null); }}>×</button>
            <Detail
              key={detail.node.id}
              worldId={worldId}
              entry={detail}
              isDm={isDm}
              links={links}
              tree={tree}
              onPick={goTo}
              onChange={reload}
              onGone={() => { setSelected(null); }}
              onPrepare={onPrepare}
              trail={ancestors(index, detail.node.id)}
              startEditing={fresh === detail.node.id}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function Detail({ worldId, entry, isDm, links, tree, onPick, onChange, onGone, onPrepare, trail, startEditing }: { startEditing: boolean; worldId: string; entry: Entry; trail: { id: string; name: string }[]; isDm: boolean; links: SceneLinkView[]; tree: WorldTree; onPick: (id: string) => void; onChange: () => Promise<void>; onGone: () => void; onPrepare: (sceneId: string) => void }) {
  const { error, run } = useGuarded();
  const { node, collection } = entry;
  // Preparing a scene that is in play was refused: said here, and the DM stays where they are.
  const [inPlay, setInPlay] = useState(false);
  // What the table is doing as far as this scene goes (a session running, which scene it plays), asked for a scene of the DM.
  const [table, setTable] = useState<{ inPlay: boolean; running: boolean; currentSceneId: string | null } | null>(null);
  // An action on the table that changes it for everyone asks first; what it said when it was done.
  const [confirming, setConfirming] = useState<"open" | "bring" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const sceneId = collection === "scenes" && isDm ? node.id : null;
  useEffect(() => {
    setInPlay(false);
    setConfirming(null);
    setDone(null);
    setTable(null);
    if (sceneId === null) return;
    let live = true;
    api.sceneContext(worldId, sceneId).then((context) => { if (live) setTable(context); }, () => undefined);
    return () => { live = false; };
  }, [node.id, sceneId, worldId]);
  const canOpen = table !== null && table.running && !table.inPlay;
  const canBring = canOpen && table.currentSceneId !== null && links.some((l) => l.fromSceneId === table.currentSceneId && l.toSceneId === node.id);
  const [editing, setEditing] = useState(startEditing);
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description);
  const [notes, setNotes] = useState(node.dmNotes ?? "");
  // A scene that still has tokens is deleted only after the DM has said so, with the tokens.
  const [askAboutTokens, setAskAboutTokens] = useState(false);
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

  /** The DM confirmed: the table opens this scene, or takes everyone to it. */
  const act = async (what: "open" | "bring"): Promise<void> => {
    setConfirming(null);
    setDone(null);
    const ok = await run(() => (what === "open" ? api.openSceneAtTable(worldId, node.id) : api.travelToScene(worldId, node.id)));
    if (!ok) return;
    setDone(t(what === "open" ? "ui.world.structure.opened" : "ui.world.structure.brought"));
    setTable(await api.sceneContext(worldId, node.id).catch(() => null));
  };

  /** Asks first whether the scene is in play: the table would refuse it, and the screen it opens has no way out while it retries. */
  const prepare = async (): Promise<void> => {
    setInPlay(false);
    const answer = { busy: false };
    const asked = await run(async () => { answer.busy = (await api.sceneContext(worldId, node.id)).inPlay; });
    if (!asked) return;
    if (answer.busy) setInPlay(true);
    else onPrepare(node.id);
  };

  return (
    <article className="detail framed">
      <header className="detail-head">
        {trail.length > 0 && (
          <nav className="where" aria-label={t("ui.world.structure.path")}>
            {trail.map((step, i) => (
              <span key={step.id}>
                {i > 0 && " › "}
                <button type="button" className="crumb" onClick={() => { onPick(step.id); }}>{step.name}</button>
              </span>
            ))}
          </nav>
        )}
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
          <label className="field">{t("ui.world.structure.name")}<input value={name} onChange={(e) => { setName(e.target.value); }} maxLength={120} required autoFocus onFocus={(e) => { if (startEditing) e.target.select(); }} /></label>
          <label className="field">{t("ui.world.structure.description")}<textarea value={description} onChange={(e) => { setDescription(e.target.value); }} /></label>
          <label className="field">{t("ui.world.structure.notes")}<textarea value={notes} onChange={(e) => { setNotes(e.target.value); }} /></label>
          <div><button type="submit" className="btn">{t("ui.world.structure.save")}</button></div>
        </form>
      )}

      {isDm && collection === "scenes" && (
        <div>
          <button type="button" className="btn" onClick={() => { void prepare(); }}>{t("ui.world.structure.prepare")}</button>
          {inPlay && <p role="alert" className="notice">{t("errors.table.scene-in-play")}</p>}
          {table?.inPlay === true && <p className="muted small">{t("ui.world.structure.being-played")}</p>}
          {canOpen && (
            <div className="row" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="btn quiet" onClick={() => { setConfirming("open"); }}>{t("ui.world.structure.open-table")}</button>
              {canBring && <button type="button" className="btn quiet" onClick={() => { setConfirming("bring"); }}>{t("ui.world.structure.bring-all")}</button>}
            </div>
          )}
          {confirming !== null && (
            <div className="notice stack tight" role="alertdialog" aria-label={t(confirming === "open" ? "ui.world.structure.open-table" : "ui.world.structure.bring-all")}>
              <p>{t(confirming === "open" ? "ui.world.structure.confirm-open" : "ui.world.structure.confirm-bring", { scene: node.name })}</p>
              <div className="row">
                <button type="button" className="btn small" onClick={() => { void act(confirming); }}>{t("ui.world.structure.confirm")}</button>
                <button type="button" className="btn quiet small" onClick={() => { setConfirming(null); }}>{t("ui.world.structure.cancel")}</button>
              </div>
            </div>
          )}
          {done !== null && <p className="muted small" role="status">{done}</p>}
        </div>
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
