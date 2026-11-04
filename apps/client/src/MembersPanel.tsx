import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { t, type MemberView } from "@phoenix/shared";
import { api } from "./api";
import { useGuarded } from "./useGuarded";

export function MembersPanel({ worldId, isDm }: { worldId: string; isDm: boolean }) {
  const [members, setMembers] = useState<MemberView[] | null>(null);
  const [username, setUsername] = useState("");
  const { error, run } = useGuarded();

  const reload = useCallback(async () => {
    await run(async () => {
      setMembers(await api.members(worldId));
    });
  }, [worldId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (members === null) return <p className="muted">{error ?? t("ui.loading")}</p>;

  async function add(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    if (await run(() => api.addMember(worldId, username).then(() => undefined))) {
      setUsername("");
      await reload();
    }
  }

  return (
    <section className="stack">
      <h2>{t("ui.world.members.title")}</h2>
      <ul className="ledger">
        {members.map((m) => (
          <li key={m.accountId}>
            <span>
              <strong>{m.username}</strong>
              <br />
              <span className={m.role === "dm" ? "small" : "muted small"} style={m.role === "dm" ? { color: "var(--oro)" } : undefined}>{t(`ui.roles.${m.role}`)}</span>
            </span>
            {isDm && m.role === "player" && (
              <button type="button" className="btn danger small" onClick={() => { void run(() => api.removeMember(worldId, m.accountId)).then(reload); }}>{t("ui.world.members.remove")}</button>
            )}
          </li>
        ))}
      </ul>
      {isDm && (
        <form className="row" onSubmit={(e) => void add(e)}>
          <input style={{ flex: 1, minWidth: "12rem", width: "auto", maxWidth: "22rem" }} aria-label={t("ui.world.members.username")} placeholder={t("ui.world.members.username")} value={username} onChange={(e) => { setUsername(e.target.value); }} required />
          <button type="submit" className="btn">{t("ui.world.members.add")}</button>
        </form>
      )}
      {error !== null && <p role="alert" className="notice">{error}</p>}
    </section>
  );
}
