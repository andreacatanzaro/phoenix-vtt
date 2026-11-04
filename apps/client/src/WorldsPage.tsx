import { useEffect, useState, type SyntheticEvent } from "react";
import { t, type AccountView, type WorldView } from "@phoenix/shared";
import { api } from "./api";
import { Ornament } from "./Decor";
import { formatGameTime } from "./format";
import { errorText } from "./messages";
import { Shell } from "./Shell";
import { WorldPage } from "./WorldPage";

export function WorldsPage({ account, onSignedOut }: { account: AccountView; onSignedOut: () => void }) {
  const [worlds, setWorlds] = useState<WorldView[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

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
  return (
    <Shell account={account} onSignOut={() => void signOut()}>
      {error !== null && <p role="alert" className="notice">{error}</p>}
      {opened !== undefined ? (
        <WorldPage world={opened} onBack={() => { setOpen(null); }} />
      ) : (
        <>
          <div className="page-title centered">
            <h1>{t("ui.worlds.title")}</h1>
            <Ornament />
            <p className="muted">{t("ui.worlds.subtitle")}</p>
          </div>
          {worlds === null ? (
            <p className="muted">{t("ui.loading")}</p>
          ) : worlds.length === 0 ? (
            <p className="muted" style={{ maxWidth: "46ch", margin: "0 auto", textAlign: "center" }}>{t("ui.worlds.empty")}</p>
          ) : (
            <ul className="world-grid">
              {worlds.map((w) => (
                <li key={w.id}>
                  <button type="button" className={`world-card ${w.role}`} aria-label={t("ui.worlds.open", { name: w.name })} onClick={() => { setOpen(w.id); }}>
                    <span className="name">{w.name}</span>
                    <span className="row" style={{ justifyContent: "space-between" }}>
                      <span className={w.role === "dm" ? "badge gold" : "badge"}>{t(`ui.roles.${w.role}`)}</span>
                      <span className="meta">{t("ui.worlds.game-time", { time: formatGameTime(w.gameTimeMinutes) })}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="create-world panel framed stack" onSubmit={(e) => void create(e)}>
            <h2>{t("ui.worlds.create")}</h2>
            <label className="field">
              {t("ui.worlds.name")}
              <input value={name} onChange={(e) => { setName(e.target.value); }} maxLength={80} required />
            </label>
            <div><button type="submit" className="btn hero">{t("ui.worlds.submit")}</button></div>
          </form>
        </>
      )}
    </Shell>
  );
}
