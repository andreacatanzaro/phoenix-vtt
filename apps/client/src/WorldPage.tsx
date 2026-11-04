import { useState } from "react";
import { t, type WorldView } from "@phoenix/shared";
import { AtlasPanel } from "./AtlasPanel";
import { Ornament } from "./Decor";
import { MembersPanel } from "./MembersPanel";
import { SessionsPanel } from "./SessionsPanel";
import { TablePanel } from "./TablePanel";

type Section = "structure" | "members" | "sessions" | "table";
const SECTIONS: Section[] = ["structure", "sessions", "table", "members"];

/** One world: its structure, its sessions and who is in it. */
export function WorldPage({ world, onBack }: { world: WorldView; onBack: () => void }) {
  const isDm = world.role === "dm";
  const [section, setSection] = useState<Section>("structure");
  // Sitting at the table takes the whole screen: the world's header and tabs step aside.
  const [seated, setSeated] = useState(false);
  if (seated) return <TablePanel worldId={world.id} seated onSeated={setSeated} />;
  return (
    <>
      <div className="world-head centered">
        <button type="button" className="crumb" onClick={onBack}>{t("ui.world.back")}</button>
        <h1>{world.name}</h1>
        <Ornament />
        <span className={isDm ? "badge gold" : "badge"}>{t(`ui.roles.${world.role}`)}</span>
      </div>
      <nav className="tabs" aria-label={t("ui.world.sections")}>
        {SECTIONS.map((name) => (
          <button key={name} type="button" aria-current={section === name ? "page" : undefined} onClick={() => { setSection(name); }}>
            {t(`ui.world.tabs.${name}`)}
          </button>
        ))}
      </nav>
      <div>
        {section === "structure" && <AtlasPanel worldId={world.id} isDm={isDm} />}
        {section === "members" && <MembersPanel worldId={world.id} isDm={isDm} />}
        {section === "sessions" && <SessionsPanel worldId={world.id} isDm={isDm} />}
        {section === "table" && <TablePanel worldId={world.id} seated={false} onSeated={setSeated} />}
      </div>
    </>
  );
}
