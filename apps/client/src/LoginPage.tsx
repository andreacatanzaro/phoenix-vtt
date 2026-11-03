import { useState, type SyntheticEvent } from "react";
import { t, type AccountView } from "@phoenix/shared";
import { api } from "./api";
import { errorText } from "./messages";

export function LoginPage({ onSignedIn }: { onSignedIn: (account: AccountView) => void }) {
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const account = registering ? await api.register({ username, password }) : await api.login({ username, password });
      onSignedIn(account);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)}>
      <h1>{registering ? t("ui.auth.register") : t("ui.auth.login")}</h1>
      <label>
        {t("ui.auth.username")}
        <input value={username} onChange={(e) => { setUsername(e.target.value); }} autoComplete="username" required />
      </label>
      {registering && <small>{t("ui.auth.username-hint")}</small>}
      <label>
        {t("ui.auth.password")}
        <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); }} autoComplete={registering ? "new-password" : "current-password"} required />
      </label>
      {registering && <small>{t("ui.auth.password-hint")}</small>}
      {error !== null && <p role="alert" className="error">{error}</p>}
      <button type="submit" disabled={busy}>{registering ? t("ui.auth.register") : t("ui.auth.login")}</button>
      <button type="button" className="link" onClick={() => { setRegistering(!registering); setError(null); }}>
        {registering ? t("ui.auth.to-login") : t("ui.auth.to-register")}
      </button>
    </form>
  );
}
