import { useCallback, useEffect, useReducer, useRef } from "react";
import type { TableCommand } from "@phoenix/shared";
import { browserDeps } from "./table/browser";
import { connectTable, tableUrl, type Connection } from "./table/connection";
import { initialState, reduce, type TableState } from "./table/state";

/** The live table of a world: its state, and a way to send commands. Leaving the screen closes the connection. */
/** With a scene it is the preparation of that scene instead of the live table. */
export function useTable(worldId: string, prepareSceneId?: string): { state: TableState; send: (command: TableCommand) => boolean; clearError: () => void; refresh: () => void } {
  const [state, dispatch] = useReducer(reduce, initialState);
  const connection = useRef<Connection | null>(null);
  useEffect(() => {
    const conn = connectTable(tableUrl(worldId, window.location, prepareSceneId), { onEvent: (event) => { dispatch({ type: "event", event, at: Date.now() }); }, onStatus: (status) => { dispatch({ type: "connection", status }); } }, browserDeps);
    connection.current = conn;
    return () => {
      conn.close();
      connection.current = null;
    };
  }, [worldId, prepareSceneId]);
  const send = useCallback((command: TableCommand) => connection.current?.send(command) ?? false, []);
  const clearError = useCallback(() => { dispatch({ type: "clear-error" }); }, []);
  const refresh = useCallback(() => { dispatch({ type: "refresh" }); }, []);
  return { state, send, clearError, refresh };
}
