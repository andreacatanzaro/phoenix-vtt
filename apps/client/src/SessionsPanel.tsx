import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { t, type SessionView } from "@phoenix/shared";
import { api } from "./api";
import { fromLocalInput, toLocalInput } from "./dates";
import { useGuarded } from "./useGuarded";

function dateText(iso: string | null): string {
  return iso === null ? t("ui.world.sessions.no-date") : new Date(iso).toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });
}

/** The board: the DM runs the sessions, players see the published, running and closed ones. */
export function SessionsPanel({ worldId, isDm }: { worldId: string; isDm: boolean }) {
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [level, setLevel] = useState("");
  const [seats, setSeats] = useState("");
  const { error, run } = useGuarded();

  const reload = useCallback(async () => {
    await run(async () => {
      setSessions(await api.sessions(worldId));
    });
  }, [worldId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (sessions === null) return <p className="muted">{error ?? t("ui.loading")}</p>;

  async function create(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    const ok = await run(() =>
      api
        .createSession(worldId, {
          title,
          scheduledAt: fromLocalInput(when),
          recommendedLevel: level === "" ? null : Number(level),
          seats: seats === "" ? null : Number(seats),
        })
        .then(() => undefined),
    );
    if (ok) {
      setTitle("");
      setWhen("");
      setLevel("");
      setSeats("");
      await reload();
    }
  }

  return (
    <section className="stack">
      <h2>{t("ui.world.sessions.title")}</h2>
      {sessions.length === 0 ? (
        <p className="muted">{t("ui.world.sessions.none")}</p>
      ) : (
        <ul className="ledger">
          {sessions.map((s) => (
            <SessionItem key={s.id} worldId={worldId} session={s} isDm={isDm} onChange={reload} />
          ))}
        </ul>
      )}
      {isDm && (
        <form className="panel stack" onSubmit={(e) => void create(e)}>
          <h3>{t("ui.world.sessions.new")}</h3>
          <SessionFields title={title} when={when} level={level} seats={seats} set={{ title: setTitle, when: setWhen, level: setLevel, seats: setSeats }} />
          <div><button type="submit" className="btn">{t("ui.world.sessions.create")}</button></div>
        </form>
      )}
      {error !== null && <p role="alert" className="notice">{error}</p>}
    </section>
  );
}

type FieldSetters = { title: (v: string) => void; when: (v: string) => void; level: (v: string) => void; seats: (v: string) => void };

/** The four details of a session, for the creation form and for editing. */
function SessionFields({ title, when, level, seats, set }: { title: string; when: string; level: string; seats: string; set: FieldSetters }) {
  return (
    <div className="form-grid">
      <label className="field wide">{t("ui.world.sessions.session-title")}<input value={title} onChange={(e) => { set.title(e.target.value); }} maxLength={120} required /></label>
      <label className="field">{t("ui.world.sessions.date")}<input type="datetime-local" value={when} onChange={(e) => { set.when(e.target.value); }} /></label>
      <label className="field">{t("ui.world.sessions.level")}<input type="number" min={1} max={20} value={level} onChange={(e) => { set.level(e.target.value); }} /></label>
      <label className="field">{t("ui.world.sessions.seats")}<input type="number" min={1} max={20} value={seats} onChange={(e) => { set.seats(e.target.value); }} /></label>
    </div>
  );
}

function SessionItem({ worldId, session, isDm, onChange }: { worldId: string; session: SessionView; isDm: boolean; onChange: () => Promise<void> }) {
  const { error, run } = useGuarded();
  const [report, setReport] = useState(session.report);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [when, setWhen] = useState(toLocalInput(session.scheduledAt));
  const [level, setLevel] = useState(session.recommendedLevel === null ? "" : String(session.recommendedLevel));
  const [seats, setSeats] = useState(session.seats === null ? "" : String(session.seats));
  const step = (name: "publish" | "start" | "close"): void => {
    void run(() => api.sessionStep(worldId, session.id, name, name === "close" ? { report } : {}).then(() => undefined)).then(onChange);
  };

  async function saveDetails(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    const ok = await run(() =>
      api
        .updateSession(worldId, session.id, {
          title,
          scheduledAt: fromLocalInput(when),
          recommendedLevel: level === "" ? null : Number(level),
          seats: seats === "" ? null : Number(seats),
        })
        .then(() => undefined),
    );
    if (ok) {
      setEditing(false);
      await onChange();
    }
  }

  const writesReport = isDm && (session.status === "running" || session.status === "closed");
  return (
    <li className="session">
      <div className="session-top">
        <span className="session-title">{session.title}</span>
        <span className={`status ${session.status}`}>{t(`ui.world.sessions.status.${session.status}`)}</span>
      </div>
      <div className="session-facts small">
        <span>{dateText(session.scheduledAt)}</span>
        {session.recommendedLevel !== null && <span>{t("ui.world.sessions.level-fact", { level: session.recommendedLevel })}</span>}
        {session.seats !== null && <span>{t("ui.world.sessions.seats-fact", { seats: session.seats })}</span>}
      </div>
      {(session.status === "running" || session.status === "closed") && session.report !== "" && !isDm && <p className="flavor chronicle">{session.report}</p>}
      {isDm && (
        <div className="row" style={{ marginTop: "0.6rem" }}>
          {session.status === "draft" && <button type="button" className="btn small" onClick={() => { step("publish"); }}>{t("ui.world.sessions.publish")}</button>}
          {(session.status === "draft" || session.status === "published") && <button type="button" className="btn quiet small" onClick={() => { step("start"); }}>{t("ui.world.sessions.start")}</button>}
          {session.status === "running" && <button type="button" className="btn small" onClick={() => { step("close"); }}>{t("ui.world.sessions.close")}</button>}
          {session.status !== "closed" && <button type="button" className="btn quiet small" onClick={() => { setEditing(!editing); }}>{t("ui.world.sessions.edit")}</button>}
          {session.status === "draft" && <button type="button" className="btn danger small" onClick={() => { void run(() => api.deleteSession(worldId, session.id)).then(onChange); }}>{t("ui.world.sessions.delete")}</button>}
        </div>
      )}
      {editing && (
        <form className="panel stack" style={{ marginTop: "0.75rem" }} onSubmit={(e) => void saveDetails(e)}>
          <SessionFields title={title} when={when} level={level} seats={seats} set={{ title: setTitle, when: setWhen, level: setLevel, seats: setSeats }} />
          <div><button type="submit" className="btn">{t("ui.world.sessions.save")}</button></div>
        </form>
      )}
      {writesReport && (
        <div className="stack" style={{ marginTop: "0.75rem", gap: "0.5rem" }}>
          <label className="field">{t("ui.world.sessions.report")}<textarea value={report} onChange={(e) => { setReport(e.target.value); }} /></label>
          <div><button type="button" className="btn quiet small" onClick={() => { void run(() => api.saveReport(worldId, session.id, report).then(() => undefined)).then(onChange); }}>{t("ui.world.sessions.save-report")}</button></div>
        </div>
      )}
      {error !== null && <p role="alert" className="notice">{error}</p>}
    </li>
  );
}
