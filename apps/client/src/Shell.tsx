import type { ReactNode } from "react";
import { t, type AccountView } from "@phoenix/shared";
import { Emblem } from "./Decor";

/** The bar every signed-in screen shares: the name of the table, who is playing, and the way out. */
export function Shell({ account, onSignOut, children }: { account: AccountView; onSignOut: () => void; children: ReactNode }) {
  return (
    <>
      <header className="topbar">
        <span className="brand" aria-label={t("ui.app.title")}>
          <Emblem />
          Phoenix
        </span>
        <div className="who">
          <span className="muted small">{account.username}</span>
          <span className="avatar" aria-hidden="true">{account.username.slice(0, 1).toUpperCase()}</span>
          <button type="button" className="btn quiet small" onClick={onSignOut}>
            {t("ui.auth.logout")}
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
