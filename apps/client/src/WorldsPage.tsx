import { useEffect, useState, type SyntheticEvent } from "react";
import { t, type AccountView, type WorldView } from "@phoenix/shared";
import { api } from "./api";
import { Ornament } from "./Decor";
import { Icon } from "./Icons";
import { lastWorld, rememberWorld } from "./last-world";
import { formatGameTime } from "./format";
import { errorText } from "./messages";
import { Shell } from "./Shell";
import { WorldPage } from "./WorldPage";

export function WorldsPage({ account, onSignedOut }: { account: AccountView; onSignedOut: () => void }) {
  const [worlds, setWorlds] = useState<WorldView[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | "dm" | "player">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.worlds().then(setWorlds, (e: unknown) => { setError(errorText(e)); });
  }, []);

  async function create(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const world = await api.createWorld(name);
      setWorlds((current) => [...(current ?? []), world]);
      setName("");
      setCreating(false);
    } catch (e) {
      setError(errorText(e));
    }
  }

  // Signing out is only shown as done once the server has ended the session; otherwise the user stays signed in and is told.
  async function signOut(): Promise<void> {
    setError(null);
    try {
      await api.logout();
      onSignedOut();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const opened = worlds?.find((w) => w.id === open);
  const lastId = lastWorld(account.id);
  const last = worlds?.find((w) => w.id === lastId);
  const shown = (worlds ?? []).filter((w) => (filter === "all" || w.role === filter) && w.name.toLowerCase().includes(search.trim().toLowerCase()));
  const openWorld = (id: string): void => {
    rememberWorld(account.id, id);
    setOpen(id);
  };
  return (
    <Shell account={account} onSignOut={() => void signOut()}>
      {error !== null && <p role="alert" className="notice">{error}</p>}
      {opened !== undefined ? (
        <WorldPage world={opened} onBack={() => { setOpen(null); }} />
      ) : (
        <div className="adventures">
          <div className="page-title centered">
            <h1>{t("ui.worlds.title")}</h1>
            <Ornament />
            <p className="muted">{t("ui.worlds.subtitle")}</p>
          </div>
          <div className="action-cards">
            <button type="button" className="action-card gold" aria-label={t("ui.worlds.create")} aria-expanded={creating} onClick={() => { setCreating((c) => !c); }}>
              <span className="action-icon"><Icon name="plus" /></span>
              <span className="action-title">{t("ui.worlds.create")}</span>
              <span className="action-hint">{t("ui.worlds.new-hint")}</span>
            </button>
          </div>
          {creating && (
            <form className="create-world panel framed stack" onSubmit={(e) => void create(e)}>
              <label className="field">
                {t("ui.worlds.name")}
                <input value={name} onChange={(e) => { setName(e.target.value); }} maxLength={80} required />
              </label>
              <div><button type="submit" className="btn hero">{t("ui.worlds.submit")}</button></div>
            </form>
          )}
          {last !== undefined && (
            <section className="stack" aria-label={t("ui.worlds.continue")}>
              <h2 className="section-title">{t("ui.worlds.continue")}</h2>
              <div className="adv-row continue">
                <span className="stack-tight">
                  <span className="continue-name">{last.name}</span>
                  <span className="row">
                    <span className={last.role === "dm" ? "badge gold" : "badge"}>{t(`ui.roles.${last.role}`)}</span>
                    <span className="meta">{t("ui.worlds.game-time", { time: formatGameTime(last.gameTimeMinutes) })}</span>
                  </span>
                </span>
                <button type="button" className="btn hero" aria-label={t("ui.worlds.continue-in", { name: last.name })} onClick={() => { openWorld(last.id); }}>{t("ui.worlds.continue-cta")}</button>
              </div>
            </section>
          )}
          <section className="stack" aria-label={t("ui.worlds.list")}>
            <div className="adv-head">
              <h2 className="section-title">{t("ui.worlds.list")} <span className="count" aria-hidden="true">{worlds?.length ?? 0}</span></h2>
              <div className="adv-tools">
                <div className="segmented" role="group" aria-label={t("ui.worlds.filter.label")}>
                  {(["all", "dm", "player"] as const).map((f) => (
                    <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); }}>{t(`ui.worlds.filter.${f}`)}</button>
                  ))}
                </div>
                <label className="search">
                  <Icon name="search" />
                  <input type="search" aria-label={t("ui.worlds.search")} placeholder={t("ui.worlds.search")} value={search} onChange={(e) => { setSearch(e.target.value); }} />
                </label>
              </div>
            </div>
            {worlds === null ? (
              <p className="muted">{t("ui.loading")}</p>
            ) : shown.length === 0 ? (
              <div className="adv-empty">
                <Icon name="folder" />
                <p>{worlds.length === 0 ? t("ui.worlds.empty") : t("ui.worlds.no-match")}</p>
              </div>
            ) : (
              <ul className="adv-list">
                {shown.map((w) => (
                  <li key={w.id} className="adv-row">
                    <span className="stack-tight">
                      <span className="name">{w.name}</span>
                      <span className="row">
                        <span className={w.role === "dm" ? "badge gold" : "badge"}>{t(`ui.roles.${w.role}`)}</span>
                        <span className="meta">{t("ui.worlds.game-time", { time: formatGameTime(w.gameTimeMinutes) })}</span>
                      </span>
                    </span>
                    <button type="button" className="btn" aria-label={t("ui.worlds.open", { name: w.name })} onClick={() => { openWorld(w.id); }}><Icon name="play" /> {t("ui.worlds.open-cta")}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
