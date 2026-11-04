import { useEffect, useState } from "react";
import { isMessageKey, t, type MemberView } from "@phoenix/shared";
import { api } from "./api";
import { Board } from "./Board";
import { ChatPanel } from "./ChatPanel";
import { Ornament } from "./Decor";
import { SceneTools } from "./SceneTools";
import { TokenPanel } from "./TokenPanel";
import { useTable } from "./useTable";

/** The live table: the board in the middle, chat and dice on one side, tokens and the DM's tools on the other. */
export function TablePage({ worldId, onLeave }: { worldId: string; onLeave: () => void }) {
  const { state, send, clearError, refresh } = useTable(worldId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [members, setMembers] = useState<MemberView[]>([]);

  useEffect(() => {
    let live = true;
    api.members(worldId).then((list) => { if (live) setMembers(list); }, () => undefined);
    return () => { live = false; };
  }, [worldId]);

  const { me, scene } = state;
  const selected = state.tokens.some((tk) => tk.id === selectedId) ? selectedId : null;
  const error = state.error === null ? null : isMessageKey(state.error) ? t(state.error) : t("errors.unavailable");

  if (state.connection === "ended") {
    return (
      <div className="panel framed centered stack">
        <p>{t("ui.world.table.connection.ended")}</p>
        <button type="button" className="btn hero" onClick={onLeave}>{t("ui.world.table.leave")}</button>
      </div>
    );
  }
  if (me === null || state.session === null) {
    return <p className="muted" role="status">{t(state.connection === "reconnecting" ? "ui.world.table.connection.reconnecting" : "ui.world.table.connection.connecting")}</p>;
  }

  const people = members.map((m) => ({ accountId: m.accountId, username: m.username }));
  return (
    <div className="table-screen">
      <header className="table-head">
        <div>
          <h1>{state.session.title}</h1>
          <Ornament />
        </div>
        <div className="row">
          <span className="muted small">{t("ui.world.table.present")}:</span>
          {state.present.map((p) => (
            <span key={p.accountId} className="badge">{p.username}{p.accountId === me.accountId ? ` (${t("ui.world.table.you")})` : ""}</span>
          ))}
          {state.connection !== "live" && <span className="status running" role="status">{t("ui.world.table.connection.reconnecting")}</span>}
          <button type="button" className="btn quiet small" onClick={onLeave}>{t("ui.world.table.leave")}</button>
        </div>
      </header>
      {error !== null && (
        <p className="notice" role="alert">
          {error} <button type="button" className="btn text" onClick={clearError}>OK</button>
        </p>
      )}
      <div className="table-grid">
        <div className="table-main">
          {scene === null ? (
            <div className="board empty panel">
              <p className="flavor">{t(me.role === "dm" ? "ui.world.table.no-scene-dm" : "ui.world.table.no-scene")}</p>
            </div>
          ) : (
            <>
              <h2 className="scene-name">{scene.name}</h2>
              <Board worldId={worldId} scene={scene} tokens={state.tokens} me={me} selectedId={selected} showStart={showStart} revision={state.revision} onSelect={setSelectedId} onMove={(tokenId, x, y) => {
                // The line is down: the token goes back where the server has it, instead of staying where it was dropped.
                if (!send({ type: "token.move", tokenId, x, y })) refresh();
              }} />
              <p className="muted small">{t("ui.world.table.map-hint")}</p>
            </>
          )}
        </div>
        <aside className="table-side">
          <ChatPanel messages={state.messages} me={me} people={people} send={send} />
          {scene !== null && <TokenPanel worldId={worldId} scene={scene} me={me} tokens={state.tokens} selectedId={selected} onSelect={setSelectedId} people={people} send={send} />}
          {me.role === "dm" && <SceneTools worldId={worldId} scene={scene} send={send} showStart={showStart} onShowStart={setShowStart} />}
        </aside>
      </div>
    </div>
  );
}
