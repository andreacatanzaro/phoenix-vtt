import { useState, type SyntheticEvent } from "react";
import { t, type AccountView } from "@phoenix/shared";
import { api } from "./api";
import { Emblem, Ornament } from "./Decor";
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

  const choose = (register: boolean): void => {
    setRegistering(register);
    setError(null);
  };

  return (
    <div className="entrance">
      <div className="entrance-top">
        <span className="brand" aria-label={t("ui.app.title")}>
          <Emblem />
          Phoenix
        </span>
      </div>
      <div className="entrance-main">
        <div className="entrance-card framed">
          <div className="head centered">
            <h1>{t("ui.auth.title")}</h1>
            <Ornament />
            <p className="muted small">{t("ui.app.tagline")}</p>
          </div>
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={!registering} onClick={() => { choose(false); }}>{t("ui.auth.login")}</button>
            <button type="button" role="tab" aria-selected={registering} onClick={() => { choose(true); }}>{t("ui.auth.register")}</button>
          </div>
          <form onSubmit={(e) => void submit(e)}>
            <label className="field">
              {t("ui.auth.username")}
              <input value={username} onChange={(e) => { setUsername(e.target.value); }} autoComplete="username" required />
              {registering && <span className="hint">{t("ui.auth.username-hint")}</span>}
            </label>
            <label className="field">
              {t("ui.auth.password")}
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); }} autoComplete={registering ? "new-password" : "current-password"} required />
              {registering && <span className="hint">{t("ui.auth.password-hint")}</span>}
            </label>
            {error !== null && <p role="alert" className="notice">{error}</p>}
            <button type="submit" className="btn hero" disabled={busy}>{registering ? t("ui.auth.register") : t("ui.auth.login")}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
