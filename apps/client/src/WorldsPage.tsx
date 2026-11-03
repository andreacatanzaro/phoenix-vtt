import { useEffect, useState, type SyntheticEvent } from "react";
import { t, type AccountView, type WorldView } from "@phoenix/shared";
import { api } from "./api";
import { errorText } from "./messages";

export function WorldsPage({ account, onSignedOut }: { account: AccountView; onSignedOut: () => void }) {
  const [worlds, setWorlds] = useState<WorldView[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="card">
      <header>
        <strong>{account.username}</strong>
        <button type="button" className="link" onClick={() => void signOut()}>{t("ui.auth.logout")}</button>
      </header>
      <h1>{t("ui.worlds.title")}</h1>
      {worlds === null ? (
        <p>{t("ui.loading")}</p>
      ) : worlds.length === 0 ? (
        <p>{t("ui.worlds.empty")}</p>
      ) : (
        <ul>
          {worlds.map((w) => (
            <li key={w.id}>
              <strong>{w.name}</strong> — {t(`ui.roles.${w.role}`)}
              <br />
              <small>{t("ui.worlds.game-time", { minutes: w.gameTimeMinutes })}</small>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void create(e)}>
        <h2>{t("ui.worlds.create")}</h2>
        <label>
          {t("ui.worlds.name")}
          <input value={name} onChange={(e) => { setName(e.target.value); }} maxLength={80} required />
        </label>
        <button type="submit">{t("ui.worlds.submit")}</button>
      </form>
      {error !== null && <p role="alert" className="error">{error}</p>}
    </main>
  );
}
