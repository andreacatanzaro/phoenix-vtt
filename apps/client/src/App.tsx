import { useEffect, useState } from "react";
import { t, type AccountView } from "@phoenix/shared";
import { api } from "./api";
import { LoginPage } from "./LoginPage";
import { errorText } from "./messages";
import { WorldsPage } from "./WorldsPage";

export function App() {
  // `undefined` while the session is being checked, `null` when nobody is signed in.
  const [account, setAccount] = useState<AccountView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().then(setAccount, (e: unknown) => { setError(errorText(e)); setAccount(null); });
  }, []);

  if (account === undefined) return <p className="page muted">{t("ui.loading")}</p>;
  return (
    <>
      {error !== null && <p role="alert" className="notice" style={{ margin: "1rem" }}>{error}</p>}
      {account === null ? (
        <LoginPage
          onSignedIn={(signedIn) => {
            // A failure of the first check no longer applies once the user is in.
            setError(null);
            setAccount(signedIn);
          }}
        />
      ) : (
        <WorldsPage account={account} onSignedOut={() => { setAccount(null); }} />
      )}
    </>
  );
}
