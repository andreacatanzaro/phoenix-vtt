import { useState } from "react";
import { t, type WorldView } from "@phoenix/shared";
import { AtlasPanel } from "./AtlasPanel";
import { Icon, type IconName } from "./Icons";
import { MembersPanel } from "./MembersPanel";
import { SessionsPanel } from "./SessionsPanel";
import { TablePage } from "./TablePage";
import { TablePanel } from "./TablePanel";

type Section = "structure" | "members" | "sessions" | "table";
const SECTIONS: Section[] = ["structure", "sessions", "table", "members"];
const SECTION_ICONS: Record<Section, IconName> = { structure: "atlas", sessions: "sessions", table: "table", members: "players" };

/** One world: its structure, its sessions and who is in it. */
export function WorldPage({ world, onBack }: { world: WorldView; onBack: () => void }) {
  const isDm = world.role === "dm";
  const [section, setSection] = useState<Section>("structure");
  // Sitting at the table takes the whole screen: the world's header and tabs step aside.
  const [seated, setSeated] = useState(false);
  // Preparing a scene also takes the whole screen: it is the table, before the session.
  const [preparing, setPreparing] = useState<string | null>(null);
  if (preparing !== null) return <TablePage worldId={world.id} prepareSceneId={preparing} onLeave={() => { setPreparing(null); }} />;
  if (seated) return <TablePanel worldId={world.id} seated onSeated={setSeated} />;
  return (
    <div className={section === "structure" ? "world-shell full" : "world-shell"}>
      <section className="world-bar" aria-label={world.name}>
        <div className="world-bar-top">
          <button type="button" className="hud-btn bar-back" data-tip={t("ui.world.back")} aria-label={t("ui.world.back")} onClick={onBack}><Icon name="back" /></button>
          <span className="bar-sep" aria-hidden="true" />
          <div className="bar-title">
            <h1>{world.name}</h1>
            <p className="bar-role"><span>{t("ui.world.role-label")}</span> <span className={isDm ? "badge gold" : "badge"}>{t(`ui.roles.${world.role}`)}</span></p>
          </div>
        </div>
        <nav className="tabs" aria-label={t("ui.world.sections")}>
          {SECTIONS.map((name) => (
            <button key={name} type="button" aria-current={section === name ? "page" : undefined} onClick={() => { setSection(name); }}>
              <Icon name={SECTION_ICONS[name]} />
              {t(`ui.world.tabs.${name}`)}
            </button>
          ))}
        </nav>
      </section>
      <div className="world-body">
        {section === "structure" && <AtlasPanel worldId={world.id} isDm={isDm} onPrepare={setPreparing} />}
        {section === "members" && <MembersPanel worldId={world.id} isDm={isDm} />}
        {section === "sessions" && <SessionsPanel worldId={world.id} isDm={isDm} />}
        {section === "table" && <TablePanel worldId={world.id} seated={false} onSeated={setSeated} />}
      </div>
    </div>
  );
}
