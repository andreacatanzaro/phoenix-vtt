import { t, type MemberView } from "@phoenix/shared";
import { colorOf } from "./table/pointers";

type Props = {
  members: readonly MemberView[];
  present: readonly { accountId: string; username: string }[];
  meId: string;
};

/** Who is in the world and who is at the table now. Everyone has a color, the same on their pointer. */
export function PlayersPanel({ members, present, meId }: Props) {
  const here = new Set(present.map((p) => p.accountId));
  // Someone at the table who is not in the list of members yet (it may still be loading) is shown anyway.
  const extra = present.filter((p) => !members.some((m) => m.accountId === p.accountId));
  const rows = [...members.map((m) => ({ accountId: m.accountId, username: m.username, role: m.role })), ...extra.map((p) => ({ accountId: p.accountId, username: p.username, role: "player" as const }))];
  return (
    <section className="panel hud-panel" aria-label={t("ui.world.table.people.title")}>
      <h2 className="section-title">{t("ui.world.table.people.title")}</h2>
      <ul className="people">
        {rows.map((p) => (
          <li key={p.accountId} className={here.has(p.accountId) ? "here" : "away"}>
            <span className={`dot ${colorOf(p.accountId)}`} aria-hidden="true" />
            <span className="name">
              {p.username}
              {p.accountId === meId ? ` (${t("ui.world.table.you")})` : ""}
            </span>
            {p.role === "dm" && <span className="badge gold">{t("ui.world.table.people.dm")}</span>}
            <span className="muted small">{here.has(p.accountId) ? t("ui.world.table.people.online") : t("ui.world.table.people.offline")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
