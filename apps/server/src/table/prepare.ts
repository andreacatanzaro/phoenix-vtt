import type { TableCommand, TableEvent, TableScene } from "@phoenix/shared";
import { roleIn } from "../access";
import { CommandError, tokenCommand, type TableDeps } from "./commands";
import { loadScene, loadTokens, runningSession } from "./store";
import { tokensFor, type Viewer } from "./visibility";

/**
 * The preparation of a scene: the DM works on a scene before the session, with the same tools as at the table but no chat,
 * no dice and no players. There is one state of the scene: what is prepared here is what the scene has when it is opened
 * at the table. The people in it are kept in the hub under this key, apart from any session.
 */
export const prepareKey = (sceneId: string): string => `prepare:${sceneId}`;

/** Whether the scene is the one being played in the running session of its world: that one is edited at the table. */
export async function sceneInPlay(deps: TableDeps, worldId: string, sceneId: string): Promise<boolean> {
  const session = await runningSession(deps.db, worldId);
  return session !== null && session.currentSceneId === sceneId;
}

/** What the DM needs when they open the preparation of a scene. */
export async function snapshotForPrepare(deps: TableDeps, scene: TableScene, viewer: Viewer): Promise<TableEvent> {
  const key = prepareKey(scene.id);
  return {
    type: "snapshot",
    mode: "prepare",
    session: { id: key, title: scene.name },
    you: { accountId: viewer.accountId, username: viewer.username, role: viewer.role },
    scene,
    tokens: tokensFor(viewer, await loadTokens(deps.db, scene.id)),
    messages: [],
    present: deps.hub.present(key),
  };
}

/** The setup of the scene was saved: whoever is preparing it sees it at once. */
export async function refreshPreparation(deps: TableDeps, worldId: string, sceneId: string): Promise<void> {
  const key = prepareKey(sceneId);
  await deps.hub.serial(key, async () => {
    const scene = await loadScene(deps.db, worldId, sceneId);
    if (scene === null) return;
    const events = new Map<string, TableEvent>();
    for (const client of deps.hub.clients(key)) events.set(client.viewer.accountId, await snapshotForPrepare(deps, scene, client.viewer));
    deps.hub.broadcast(key, (viewer) => events.get(viewer.accountId) ?? null);
  });
}

/** The scene was opened at the table: whoever was preparing it is told and let go, since it is edited at the table now. */
export function closePreparation(deps: TableDeps, sceneId: string): void {
  deps.hub.endSession(prepareKey(sceneId), "errors.table.scene-in-play");
}

/**
 * One command from the DM in the preparation of a scene. Only the commands on tokens and texts belong here; the person
 * and the scene are checked again every time, since either may have changed while the command waited.
 */
export function applyPrepareCommand(deps: TableDeps, worldId: string, sceneId: string, asked: Viewer, command: TableCommand, stillSignedIn: () => Promise<boolean>): Promise<void> {
  const key = prepareKey(sceneId);
  const work = async (): Promise<void> => {
    if (!(await stillSignedIn())) throw new CommandError("errors.unauthenticated");
    const role = await roleIn(deps.db, worldId, asked.accountId);
    if (role !== "dm") throw new CommandError("errors.forbidden");
    if ((await loadScene(deps.db, worldId, sceneId)) === null) throw new CommandError("errors.table.bad-target");
    if (await sceneInPlay(deps, worldId, sceneId)) throw new CommandError("errors.table.scene-in-play");
    switch (command.type) {
      case "ping":
      case "pointer":
        return;
      case "token.move":
      case "token.add":
      case "token.update":
      case "token.remove":
        return tokenCommand(deps, { roomKey: key, worldId, sceneId }, { ...asked, role }, command);
      case "chat.send":
      case "roll.request":
      case "scene.open":
      case "scene.travel":
      case "view.sync":
        throw new CommandError("errors.table.prepare-only");
    }
  };
  return deps.hub.serial(key, async () => {
    // A scene is opened at the table in the queue of the session. The check "is it in play?" and the write must not
    // straddle that, so the command takes its turn in that queue too (the table never waits for this one).
    const running = await runningSession(deps.db, worldId);
    return running === null ? work() : deps.hub.serial(running.id, work);
  });
}
