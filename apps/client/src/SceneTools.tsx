import { useEffect, useState } from "react";
import { MAX_GRID_PX, MIN_GRID_PX, t, type TableCommand, type TableScene } from "@phoenix/shared";
import { api } from "./api";
import { sceneOptions, type SceneOption } from "./tree";
import { useGuarded } from "./useGuarded";

type Props = {
  worldId: string;
  scene: TableScene | null;
  send: (command: TableCommand) => boolean;
  showStart: boolean;
  onShowStart: (on: boolean) => void;
};

type Form = { gridPx: number; gridOffsetX: number; gridOffsetY: number; startX: number; startY: number; startW: number; startH: number };

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <label className="field">
      {label}
      <input type="number" value={value} {...(min === undefined ? {} : { min })} {...(max === undefined ? {} : { max })} onChange={(e) => { onChange(Number(e.target.value)); }} />
    </label>
  );
}

/** The DM's own tools: which scene is played, taking everyone to another, and the map and grid of the scene. */
export function SceneTools({ worldId, scene, send, showStart, onShowStart }: Props) {
  const [options, setOptions] = useState<SceneOption[]>([]);
  const [pick, setPick] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState(false);
  const guard = useGuarded();
  const sceneId = scene?.id ?? null;

  useEffect(() => {
    let live = true;
    void guard.run(async () => {
      const tree = await api.tree(worldId);
      if (live) setOptions(sceneOptions(tree));
    });
    return () => { live = false; };
    // The list is read once per world.
  }, [worldId]);

  useEffect(() => {
    setSaved(false);
    if (sceneId === null) {
      setForm(null);
      return;
    }
    let live = true;
    void guard.run(async () => {
      const s = await api.sceneTable(worldId, sceneId);
      if (live) setForm({ gridPx: s.gridPx, gridOffsetX: s.gridOffsetX, gridOffsetY: s.gridOffsetY, startX: s.start.x, startY: s.start.y, startW: s.start.w, startH: s.start.h });
    });
    return () => { live = false; };
  }, [worldId, sceneId]);

  const upload = async (file: File | undefined): Promise<void> => {
    if (file === undefined || sceneId === null) return;
    await guard.run(async () => {
      const image = await api.uploadImage(worldId, "map", file);
      await api.updateSceneTable(worldId, sceneId, { mapImageId: image.id });
    });
  };

  const save = async (): Promise<void> => {
    if (form === null || sceneId === null) return;
    const ok = await guard.run(async () => {
      await api.updateSceneTable(worldId, sceneId, { gridPx: form.gridPx, gridOffsetX: form.gridOffsetX, gridOffsetY: form.gridOffsetY, start: { x: form.startX, y: form.startY, w: form.startW, h: form.startH } });
    });
    setSaved(ok);
  };

  const set = (changes: Partial<Form>): void => {
    setSaved(false);
    setForm((f) => (f === null ? f : { ...f, ...changes }));
  };

  return (
    <section className="panel stack" aria-label={t("ui.world.table.tools.title")}>
      <h2 className="section-title">{t("ui.world.table.tools.title")}</h2>
      <div className="stack tight">
        <label className="field">
          {t("ui.world.table.tools.scene")}
          <select value={pick} onChange={(e) => { setPick(e.target.value); }}>
            <option value="">{t("ui.world.table.tools.pick-scene")}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.path}</option>
            ))}
          </select>
        </label>
        <div className="row">
          <button type="button" className="btn quiet" disabled={pick === ""} onClick={() => { send({ type: "scene.open", sceneId: pick }); }}>{t("ui.world.table.tools.open")}</button>
          <button type="button" className="btn" disabled={pick === "" || scene === null} onClick={() => { send({ type: "scene.travel", toSceneId: pick }); }}>{t("ui.world.table.tools.travel")}</button>
        </div>
        <p className="muted small">{t("ui.world.table.tools.travel-hint")}</p>
      </div>
      {form !== null && scene !== null && (
        <form className="stack tight" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h3>{t("ui.world.table.tools.map")}</h3>
          <p className="muted small">{scene.mapImageId === null ? t("ui.world.table.tools.map-none") : t("ui.world.table.tools.map-current")}</p>
          <label className="field">
            {t("ui.world.table.tools.map-upload")}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void upload(file); }} />
          </label>
          <div className="form-grid">
            <NumberField label={t("ui.world.table.tools.grid")} value={form.gridPx} min={MIN_GRID_PX} max={MAX_GRID_PX} onChange={(gridPx) => { set({ gridPx }); }} />
            <NumberField label={t("ui.world.table.tools.offset-x")} value={form.gridOffsetX} onChange={(gridOffsetX) => { set({ gridOffsetX }); }} />
            <NumberField label={t("ui.world.table.tools.offset-y")} value={form.gridOffsetY} onChange={(gridOffsetY) => { set({ gridOffsetY }); }} />
          </div>
          <h3>{t("ui.world.table.tools.start")}</h3>
          <div className="form-grid">
            <NumberField label={t("ui.world.table.tools.start-x")} value={form.startX} onChange={(startX) => { set({ startX }); }} />
            <NumberField label={t("ui.world.table.tools.start-y")} value={form.startY} onChange={(startY) => { set({ startY }); }} />
            <NumberField label={t("ui.world.table.tools.start-w")} value={form.startW} min={1} onChange={(startW) => { set({ startW }); }} />
            <NumberField label={t("ui.world.table.tools.start-h")} value={form.startH} min={1} onChange={(startH) => { set({ startH }); }} />
          </div>
          <label className="switch"><input type="checkbox" checked={showStart} onChange={(e) => { onShowStart(e.target.checked); }} />{t("ui.world.table.tools.show-start")}</label>
          <div className="row">
            <button type="submit" className="btn">{t("ui.world.table.tools.save-grid")}</button>
            {saved && <span className="muted small" role="status">{t("ui.world.table.tools.saved")}</span>}
          </div>
        </form>
      )}
      {guard.error !== null && <p className="error" role="alert">{guard.error}</p>}
    </section>
  );
}
