import { useEffect, useMemo, useRef, useState } from "react";
import { CELL_METERS, isMessageKey, t, type MemberView, type TableCommand } from "@phoenix/shared";
import { api } from "./api";
import { Board, type BoardHandle } from "./Board";
import { ChatPanel } from "./ChatPanel";
import { Icon, type IconName } from "./Icons";
import { PlayersPanel } from "./PlayersPanel";
import { AlignBar } from "./AlignBar";
import { SceneControls } from "./SceneControls";
import { startAlign, type AlignState, type AlignStep } from "./table/align";
import { ScenesPanel } from "./ScenesPanel";
import { SelectionBar } from "./SelectionBar";
import type { BoardMove } from "./table/board-view";
import { draftStyle } from "./table/draft";
import { samePoint, type Point } from "./table/geometry";
import { formatMeters } from "./table/measure";
import { isTypingTarget, toolForKey, TOOL_KEYS, TOOLS, type MeasureMode, type SelectMode, type Tool } from "./table/tools";
import { TokenDetailsPanel, TokensPanel } from "./TokenPanel";
import { ToolColumn } from "./ToolColumn";
import { ToolOptions } from "./ToolOptions";
import { useTable } from "./useTable";

type Panel = "players" | "chat" | "tokens" | "details" | "scenes";

/**
 * The live table, the way Owlbear Rodeo lays it out: the map fills the whole screen and everything else floats over it.
 * Top left the menu and the panels it opens, top middle the options of the tool, on the right the tools, at the bottom
 * the bar to add to the table (the DM's) and the scale with the controls of the scene.
 */
export function TablePage({ worldId, onLeave }: { worldId: string; onLeave: () => void }) {
  const { state, send, clearError, refresh } = useTable(worldId);
  const board = useRef<BoardHandle>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [selectMode, setSelectMode] = useState<SelectMode>("rectangle");
  const [measureMode, setMeasureMode] = useState<MeasureMode>("ruler");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [panel, setPanel] = useState<Panel | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toolsCollapsed, setToolsCollapsed] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [resetViewSeq, setResetViewSeq] = useState(0);
  const [view, setView] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [align, setAlign] = useState<{ step: AlignStep; state: AlignState; preview: boolean } | null>(null);
  const [draft, setDraft] = useState<{ cell: Point; at: Point; text: string } | null>(null);
  const [members, setMembers] = useState<MemberView[]>([]);

  useEffect(() => {
    let live = true;
    api.members(worldId).then((list) => { if (live) setMembers(list); }, () => undefined);
    return () => { live = false; };
  }, [worldId]);

  const { me, scene } = state;
  const isDm = me?.role === "dm";
  const tools = useMemo(() => TOOLS.filter((name) => name !== "text" || isDm), [isDm]);
  // What is selected only counts while it is on the board: a token that goes away leaves the selection.
  const selected = useMemo(() => state.tokens.filter((tk) => selectedIds.has(tk.id)), [state.tokens, selectedIds]);
  const selectedSet = useMemo(() => new Set(selected.map((tk) => tk.id)), [selected]);

  // A text tool that is no longer allowed (this person is not the DM), or a scene that changed, drops what was in hand.
  useEffect(() => {
    if (!tools.includes(tool)) setTool("move");
  }, [tools, tool]);
  useEffect(() => {
    setDraft(null);
    setAlign(null);
  }, [scene?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Escape drops the text being written even from inside its own field, which is where the cursor is.
      if (e.key === "Escape" && draft !== null) {
        setDraft(null);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        // One thing at a time: the alignment, then the panels, then the selection.
        if (align !== null) {
          setAlign(null);
          return;
        }
        if (panel !== null || controlsOpen || helpOpen) {
          setPanel(null);
          setControlsOpen(false);
          setHelpOpen(false);
        } else setSelectedIds(new Set());
        return;
      }
      const next = toolForKey(e.key);
      if (next !== null && tools.includes(next)) setTool(next);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [tools, draft, panel, controlsOpen, helpOpen, align]);

  if (state.connection === "ended") {
    return (
      <div className="stage">
        <div className="panel framed centered stack stage-message">
          <p>{t("ui.world.table.connection.ended")}</p>
          <button type="button" className="btn hero" onClick={onLeave}>{t("ui.world.table.leave")}</button>
        </div>
      </div>
    );
  }
  if (me === null || state.session === null) {
    return (
      <div className="stage">
        <p className="muted stage-message" role="status">{t(state.connection === "reconnecting" ? "ui.world.table.connection.reconnecting" : "ui.world.table.connection.connecting")}</p>
      </div>
    );
  }

  const error = state.error === null ? null : isMessageKey(state.error) ? t(state.error) : t("errors.unavailable");
  const people = members.map((m) => ({ accountId: m.accountId, username: m.username }));
  const open = (name: Panel): void => {
    setPanel((current) => (current === name ? null : name));
    setControlsOpen(false);
    setHelpOpen(false);
  };
  const one = selected.length === 1 ? selected[0] : undefined;

  const move = (moves: BoardMove[]): void => {
    // The line is down: the tokens go back where the server has them, instead of staying where they were dropped.
    let sentAll = true;
    for (const m of moves) if (!send({ type: "token.move", tokenId: m.id, x: m.x, y: m.y })) sentAll = false;
    if (!sentAll) refresh();
  };

  const write = (): void => {
    if (draft === null) return;
    const text = draft.text.trim();
    if (text !== "") send({ type: "token.add", kind: "text", label: text, color: "gold", x: draft.cell.x, y: draft.cell.y, size: 1, hidden: false, travels: false, ownerAccountId: null, imageId: null } satisfies TableCommand);
    setDraft(null);
  };

  const pillButton = (name: Panel, icon: IconName, label: string) => (
    <button type="button" className="hud-btn" aria-pressed={panel === name} data-tip={label} aria-label={label} onClick={() => { open(name); }}>
      <Icon name={icon} />
    </button>
  );

  return (
    <div className="stage">
      {scene === null ? (
        <div className="board empty">
          <p className="flavor">{t(isDm ? "ui.world.table.no-scene-dm" : "ui.world.table.no-scene")}</p>
        </div>
      ) : (
        <Board
          ref={board}
          worldId={worldId}
          scene={scene}
          tokens={state.tokens}
          me={me}
          selectedIds={selectedSet}
          tool={tool}
          selectMode={selectMode}
          measureMode={measureMode}
          showStart={showStart}
          revision={state.revision}
          pointers={state.pointers}
          viewRequest={state.viewRequest}
          resetViewSeq={resetViewSeq}
          align={align}
          onAlign={(next) => { setAlign((a) => (a === null ? a : { ...a, state: next })); }}
          onSelect={(ids) => { setSelectedIds(new Set(ids)); }}
          onMove={move}
          onPointer={(x, y) => { send({ type: "pointer", x, y }); }}
          onPlaceText={(cell, at) => { setDraft({ cell, at, text: "" }); }}
          onView={setView}
          onAnchor={(at) => { setAnchor((now) => (samePoint(now, at) ? now : at)); }}
        />
      )}

      <div className="hud hud-tl">
        <div className="hud-pill" role="toolbar" aria-label={t("ui.world.table.hud.menu")}>
          <button type="button" className="hud-btn" data-tip={t("ui.world.table.hud.exit")} aria-label={t("ui.world.table.hud.exit")} onClick={onLeave}>
            <Icon name="exit" />
          </button>
          <span className="hud-title">{state.session.title}</span>
          {pillButton("players", "players", t("ui.world.table.hud.players"))}
          {pillButton("chat", "chat", t("ui.world.table.hud.chat"))}
          {!isDm && pillButton("tokens", "token", t("ui.world.table.hud.tokens"))}
        </div>
        {state.connection !== "live" && (
          <span className="status running" role="status">
            {t("ui.world.table.connection.reconnecting")}
          </span>
        )}
        {panel === "players" && <PlayersPanel members={members} present={state.present} meId={me.accountId} />}
        {panel === "chat" && <ChatPanel messages={state.messages} me={me} people={people} send={send} />}
        {panel === "tokens" && !isDm && scene !== null && <TokensPanel worldId={worldId} scene={scene} me={me} tokens={state.tokens} selectedIds={selectedSet} onSelect={(id) => { setSelectedIds(new Set([id])); setPanel("details"); }} people={people} send={send} />}
        {panel === "details" && one !== undefined && <TokenDetailsPanel token={one} worldId={worldId} me={me} people={people} send={send} onClose={() => { setPanel(null); setSelectedIds(new Set()); }} />}
      </div>

      {align !== null && scene !== null && (
        <AlignBar worldId={worldId} sceneId={scene.id} step={align.step} onStep={(step) => { setAlign({ ...align, step }); }} state={align.state} preview={align.preview} onPreview={(preview) => { setAlign({ ...align, preview }); }} onCancel={() => { setAlign(null); }} onDone={() => { setAlign(null); }} />
      )}
      <ToolOptions tool={tool} selectMode={selectMode} onSelectMode={setSelectMode} measureMode={measureMode} onMeasureMode={setMeasureMode} />
      {error !== null && (
        <p className="notice hud-notice" role="alert">
          {error}{" "}
          <button type="button" className="btn text" onClick={clearError}>OK</button>
        </p>
      )}

      <ToolColumn tools={tools} tool={tool} onTool={setTool} collapsed={toolsCollapsed} onCollapse={() => { setToolsCollapsed((c) => !c); }} />

      {scene !== null && anchor !== null && selected.length > 0 && tool === "select" && (
        <SelectionBar selected={selected} isDm={isDm} at={anchor} send={send} onMore={() => { open("details"); }} />
      )}

      {isDm && scene !== null && (
        <div className="hud hud-bc">
          {panel === "scenes" && <ScenesPanel worldId={worldId} scene={scene} send={send} />}
          {panel === "tokens" && <TokensPanel worldId={worldId} scene={scene} me={me} tokens={state.tokens} selectedIds={selectedSet} onSelect={(id) => { setSelectedIds(new Set([id])); setPanel("details"); }} people={people} send={send} />}
          <div className="hud-pill" role="toolbar" aria-label={t("ui.world.table.hud.dock")}>
            <button type="button" className="hud-btn" aria-pressed={panel === "scenes"} data-tip={t("ui.world.table.hud.scenes")} aria-label={t("ui.world.table.hud.scenes")} onClick={() => { open("scenes"); }}>
              <Icon name="scenes" />
            </button>
            <button type="button" className="hud-btn" aria-pressed={panel === "tokens"} data-tip={t("ui.world.table.hud.tokens")} aria-label={t("ui.world.table.hud.tokens")} onClick={() => { open("tokens"); }}>
              <Icon name="token" />
            </button>
          </div>
        </div>
      )}
      {isDm && scene === null && (
        <div className="hud hud-bc">
          {panel === "scenes" && <ScenesPanel worldId={worldId} scene={null} send={send} />}
          <div className="hud-pill" role="toolbar" aria-label={t("ui.world.table.hud.dock")}>
            <button type="button" className="hud-btn" aria-pressed={panel === "scenes"} data-tip={t("ui.world.table.hud.scenes")} aria-label={t("ui.world.table.hud.scenes")} onClick={() => { open("scenes"); }}>
              <Icon name="scenes" />
            </button>
          </div>
        </div>
      )}

      <div className="hud hud-br">
        {controlsOpen && (
          <SceneControls
            worldId={worldId}
            scene={scene}
            isDm={isDm}
            showStart={showStart}
            onShowStart={setShowStart}
            view={view}
            onSetView={(x, y, zoom) => { board.current?.setView({ x, y }, zoom); }}
            onResetView={() => { setResetViewSeq((n) => n + 1); }}
            onAlign={() => {
              if (scene === null || scene.mapWidth === null || scene.mapHeight === null) return;
              setAlign({ step: "offset", state: startAlign({ w: scene.mapWidth, h: scene.mapHeight }, scene.gridPx), preview: false });
              setControlsOpen(false);
            }}
            onSyncView={() => {
              const now = board.current?.getView();
              if (now !== null && now !== undefined) send({ type: "view.sync", x: now.x, y: now.y, zoom: now.zoom });
            }}
          />
        )}
        <button type="button" className="hud-pill scale" aria-pressed={controlsOpen} aria-label={t("ui.world.table.hud.controls")} data-tip={t("ui.world.table.hud.controls")} onClick={() => { setControlsOpen((o) => !o); setPanel(null); setHelpOpen(false); }}>
          {formatMeters(CELL_METERS)}
        </button>
      </div>

      <div className="hud hud-bl">
        {helpOpen && (
          <section className="panel hud-panel" aria-label={t("ui.world.table.help.title")}>
            <h2 className="section-title">{t("ui.world.table.help.title")}</h2>
            <ul className="stack tight small">
              <li>{t("ui.world.table.help.wheel")}</li>
              <li>{t("ui.world.table.help.drag")}</li>
              <li>{t("ui.world.table.help.select")}</li>
              <li>{t("ui.world.table.help.escape")}</li>
            </ul>
            <h3>{t("ui.world.table.help.keys")}</h3>
            <ul className="keys">
              {tools.map((name) => (
                <li key={name}>
                  <kbd>{TOOL_KEYS[name].toUpperCase()}</kbd> {t(`ui.world.table.toolbar.${name}`)}
                </li>
              ))}
            </ul>
          </section>
        )}
        <button type="button" className="hud-btn round" aria-pressed={helpOpen} data-tip={t("ui.world.table.hud.help")} aria-label={t("ui.world.table.hud.help")} onClick={() => { setHelpOpen((o) => !o); setPanel(null); setControlsOpen(false); }}>
          <Icon name="help" />
        </button>
      </div>

      {draft !== null && (
        <form className="text-draft hud-pill" style={draftStyle(draft.at)} onSubmit={(e) => { e.preventDefault(); write(); }}>
          <input autoFocus value={draft.text} maxLength={200} placeholder={t("ui.world.table.draft.placeholder")} aria-label={t("ui.world.table.draft.text")} onChange={(e) => { setDraft({ ...draft, text: e.target.value }); }} />
          <button type="submit" className="hud-btn" aria-label={t("ui.world.table.draft.confirm")} data-tip={t("ui.world.table.draft.confirm")}>
            <Icon name="plus" />
          </button>
          <button type="button" className="hud-btn" aria-label={t("ui.world.table.draft.cancel")} data-tip={t("ui.world.table.draft.cancel")} onClick={() => { setDraft(null); }}>
            <Icon name="close" />
          </button>
        </form>
      )}
    </div>
  );
}
