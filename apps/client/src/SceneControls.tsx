import { useEffect, useRef, useState } from "react";
import { CELL_METERS, MAX_GRID_PX, MIN_GRID_PX, t, type TableScene } from "@phoenix/shared";
import { api } from "./api";
import { Icon } from "./Icons";
import { formatMeters } from "./table/measure";
import { useGuarded } from "./useGuarded";

type Form = { gridPx: number; gridOffsetX: number; gridOffsetY: number; startX: number; startY: number; startW: number; startH: number };

type Props = {
  worldId: string;
  scene: TableScene | null;
  isDm: boolean;
  showStart: boolean;
  onShowStart: (on: boolean) => void;
  /** Where the view is: the middle of the screen in scene pixels, and the zoom (1 = 100%). Null until the board reports it. */
  view: { x: number; y: number; zoom: number } | null;
  onSetView: (x: number, y: number, zoom: number) => void;
  onResetView: () => void;
  /** Takes everyone to this view (DM only). */
  onSyncView: () => void;
  /** Starts aligning the map to the grid (DM only; needs a map). */
  onAlign: () => void;
  /** Preparing a scene: nobody else is there, so there is nobody to bring to this view. */
  preparing?: boolean;
};

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number | "any" }) {
  return (
    <label className="field">
      {label}
      <input type="number" value={value} {...(min === undefined ? {} : { min })} {...(max === undefined ? {} : { max })} {...(step === undefined ? {} : { step })} onChange={(e) => { onChange(Number(e.target.value)); }} />
    </label>
  );
}

/**
 * The panel behind the scale button, like "Scene Controls" on Owlbear Rodeo: the grid and the view. The grid, the map and
 * the start zone are the DM's; the view (where you look, zoom, back to the whole board) is everyone's.
 */
export function SceneControls({ worldId, scene, isDm, showStart, onShowStart, view, onSetView, onResetView, onSyncView, onAlign, preparing = false }: Props) {
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Counts the changes made to the form, so a save that was asked for before a later change cannot claim to have saved it.
  const revision = useRef(0);
  const guard = useGuarded();
  const sceneId = scene?.id ?? null;
  // The three numbers of the view, kept together here: the board reports a change a moment late, and a second number
  // typed in the meantime must not bring the first back to what it was.
  const [place, setPlace] = useState(view);
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setPlace(view);
  }, [view]);

  // The start zone of the scene changed under the form (it was drawn on the map): the form follows it, or saving the grid
  // would send the old one back. The grid fields are left alone, they may be half typed.
  const zone = scene?.start;
  useEffect(() => {
    if (zone === undefined) return;
    setForm((f) => (f === null || (f.startX === zone.x && f.startY === zone.y && f.startW === zone.w && f.startH === zone.h) ? f : { ...f, startX: zone.x, startY: zone.y, startW: zone.w, startH: zone.h }));
  }, [zone?.x, zone?.y, zone?.w, zone?.h]);

  useEffect(() => {
    setSaved(false);
    if (!isDm || sceneId === null) {
      setForm(null);
      return;
    }
    let live = true;
    void guard.run(async () => {
      const s = await api.sceneTable(worldId, sceneId);
      if (live) setForm({ gridPx: s.gridPx, gridOffsetX: s.gridOffsetX, gridOffsetY: s.gridOffsetY, startX: s.start.x, startY: s.start.y, startW: s.start.w, startH: s.start.h });
    });
    return () => { live = false; };
  }, [worldId, sceneId, isDm]);

  const upload = async (file: File | undefined): Promise<void> => {
    if (file === undefined || sceneId === null) return;
    await guard.run(async () => {
      const image = await api.uploadImage(worldId, "map", file);
      await api.updateSceneTable(worldId, sceneId, { mapImageId: image.id });
    });
  };

  const save = async (): Promise<void> => {
    if (form === null || sceneId === null) return;
    const asked = revision.current;
    setSaving(true);
    const ok = await guard.run(async () => {
      await api.updateSceneTable(worldId, sceneId, { gridPx: form.gridPx, gridOffsetX: form.gridOffsetX, gridOffsetY: form.gridOffsetY, start: { x: form.startX, y: form.startY, w: form.startW, h: form.startH } });
    });
    setSaving(false);
    // Said only if the form is still what was saved.
    setSaved(ok && revision.current === asked);
  };

  const set = (changes: Partial<Form>): void => {
    revision.current += 1;
    setSaved(false);
    setForm((f) => (f === null ? f : { ...f, ...changes }));
  };

  // The view is typed in as a number and applied when it changes; the board reports the new place back.
  const move = (changes: Partial<{ x: number; y: number; zoom: number }>): void => {
    if (place === null) return;
    const next = { ...place, ...changes };
    typing.current = true;
    setPlace(next);
    onSetView(next.x, next.y, next.zoom);
  };

  return (
    <section className="panel hud-panel wide" aria-label={t("ui.world.table.controls.title")}>
      <h2 className="section-title">{t("ui.world.table.controls.title")}</h2>
      {isDm && scene !== null && form !== null && (
        <form className="stack tight" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h3>{t("ui.world.table.controls.grid")}</h3>
          <p className="muted small">{t("ui.world.table.controls.measurement-value", { meters: formatMeters(CELL_METERS) })}</p>
          <p className="muted small">{scene.mapImageId === null ? t("ui.world.table.tools.map-none") : t("ui.world.table.tools.map-current")}</p>
          <label className="field">
            {t("ui.world.table.tools.map-upload")}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void upload(file); }} />
          </label>
          {scene.mapImageId !== null && scene.mapWidth !== null && (
            <div className="stack tight">
              <button type="button" className="btn small" onClick={onAlign}>{t("ui.world.table.align.start")}</button>
              <p className="muted small">{t("ui.world.table.align.start-hint")}</p>
            </div>
          )}
          <div className="form-grid">
            <NumberField label={t("ui.world.table.tools.grid")} value={form.gridPx} min={MIN_GRID_PX} max={MAX_GRID_PX} step="any" onChange={(gridPx) => { set({ gridPx }); }} />
            <NumberField label={t("ui.world.table.tools.offset-x")} value={form.gridOffsetX} step="any" onChange={(gridOffsetX) => { set({ gridOffsetX }); }} />
            <NumberField label={t("ui.world.table.tools.offset-y")} value={form.gridOffsetY} step="any" onChange={(gridOffsetY) => { set({ gridOffsetY }); }} />
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
            <button type="submit" className="btn" disabled={saving}>{t("ui.world.table.tools.save-grid")}</button>
            {saved && <span className="muted small" role="status">{t("ui.world.table.tools.saved")}</span>}
          </div>
        </form>
      )}
      {scene !== null && (
        <div className="stack tight">
          <h3>{t("ui.world.table.controls.view")}</h3>
          {place !== null && (
            <div className="form-grid" onBlur={() => { typing.current = false; setPlace(view); }}>
              <NumberField label={t("ui.world.table.controls.position-x")} value={Math.round(place.x)} onChange={(x) => { move({ x }); }} />
              <NumberField label={t("ui.world.table.controls.position-y")} value={Math.round(place.y)} onChange={(y) => { move({ y }); }} />
              <NumberField label={t("ui.world.table.controls.zoom")} value={Math.round(place.zoom * 100)} min={10} max={600} onChange={(percent) => { move({ zoom: percent / 100 }); }} />
            </div>
          )}
          <div className="row">
            <button type="button" className="btn quiet small" onClick={onResetView}>
              <Icon name="reset" />
              {t("ui.world.table.controls.reset-view")}
            </button>
            {isDm && !preparing && (
              <button type="button" className="btn quiet small" onClick={onSyncView}>
                <Icon name="sync" />
                {t("ui.world.table.controls.sync-view")}
              </button>
            )}
          </div>
        </div>
      )}
      {guard.error !== null && <p className="error" role="alert">{guard.error}</p>}
    </section>
  );
}
