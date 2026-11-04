// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TablePanel } from "./TablePanel";
import { fakeServer } from "./test-helpers";

vi.mock("./TablePage", () => ({ TablePage: ({ onLeave }: { onLeave: () => void }) => <button type="button" onClick={onLeave}>tavolo-aperto</button> }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const session = (status: string, title = "Prova") => ({ id: "x-" + title, title, scheduledAt: null, recommendedLevel: null, seats: null, status, report: "", createdAt: "2026-01-01T00:00:00.000Z", startedAt: null, closedAt: null });

function Host() {
  const [seated, setSeated] = useState(false);
  return <TablePanel worldId="w1" seated={seated} onSeated={setSeated} />;
}

describe("TablePanel", () => {
  it("waits while it looks for a running session", () => {
    fakeServer({ "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [] } }] });
    render(<Host />);
    expect(screen.getByRole("status").textContent).toBe("Caricamento…");
  });

  it("says there is nothing to join when no session is running", async () => {
    fakeServer({ "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [session("published"), session("closed", "Vecchia")] } }] });
    render(<Host />);
    expect(await screen.findByText("Nessuna sessione in corso. Il DM la avvia dalla scheda Sessioni.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Siedi al tavolo" })).toBeNull();
  });

  it("offers to sit down at the running session, and leaves again", async () => {
    fakeServer({ "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [session("closed", "Vecchia"), session("running", "La locanda")] } }] });
    render(<Host />);
    expect(await screen.findByText("Sessione in corso: La locanda")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Siedi al tavolo" }));
    fireEvent.click(await screen.findByRole("button", { name: "tavolo-aperto" }));
    expect(await screen.findByRole("button", { name: "Siedi al tavolo" })).toBeTruthy();
  });

  it("shows the error when the sessions cannot be read", async () => {
    fakeServer({ "GET /api/worlds/w1/sessions": [{ status: 500, body: { error: "errors.unavailable" } }] });
    render(<Host />);
    expect((await screen.findByRole("alert")).textContent).toBe("Il servizio non è disponibile.");
  });
});
