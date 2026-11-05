import { useState, type SyntheticEvent } from "react";
import { t, type AreaView, type MapPoint, type PlaceView, type RegionView, type SceneLinkView, type SceneView, type WorldTree } from "@phoenix/shared";
import { api, imageUrl } from "../api";
import { useGuarded } from "../useGuarded";
import { MapCanvas, type MapArrow, type MapMode, type MapPin, type MapShape } from "./MapCanvas";

type Located = { region: RegionView | null; area: AreaView | null; place: PlaceView | null; scene: SceneView | null };

/** The element with the levels above it, found in the tree by its id. */
function locate(tree: WorldTree, id: string): Located {
  for (const region of tree.regions) {
    if (region.id === id) return { region, area: null, place: null, scene: null };
    for (const area of region.areas) {
      if (area.id === id) return { region, area, place: null, scene: null };
      for (const place of area.places) {
        if (place.id === id) return { region, area, place, scene: null };
        for (const scene of place.scenes) if (scene.id === id) return { region, area, place, scene };
      }
    }
  }
  return { region: null, area: null, place: null, scene: null };
}

/** What a person can do on a map: draw a shape or place a pin, to create something or to move it. */
type Action =
  | { kind: "new-area"; regionId: string }
  | { kind: "redraw-area"; areaId: string }
  | { kind: "new-place"; areaId: string }
  | { kind: "move-place"; placeId: string }
  | { kind: "new-scene"; placeId: string }
  | { kind: "move-scene"; sceneId: string }
  | { kind: "new-exit"; placeId: string };

type Choice = { action: Action; label: string };
const same = (a: Action | null, b: Action): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b);

type Section = {
  key: string;
  title: string;
  /** The picture, and who owns it (a map is uploaded, changed or taken away on its owner). */
  mapImageId: string | null;
  owner: { collection: "regions" | "places"; id: string; name: string };
  /** The map is this element's own, so it is changed or taken away here; elsewhere it is only shown. */
  ownsMap: boolean;
  shapes: MapShape[];
  pins: MapPin[];
  /** The exits between the scenes pinned on this map, drawn as arrows. */
  arrows: MapArrow[];
  choices: Choice[];
  /** The area the pins must stay inside, when they have to. */
  inside?: readonly MapPoint[] | undefined;
  /** There is no map to show this on (the map above is missing): the section is left out, since a map is not required. */
  unavailable?: boolean | undefined;
};

type Props = {
  worldId: string;
  isDm: boolean;
  tree: WorldTree;
  /** The exits between scenes (the DM's: a player gets none). */
  links: readonly SceneLinkView[];
  /** The element being shown: its level decides which maps it has. */
  collection: "regions" | "areas" | "places" | "scenes";
  id: string;
  onPick: (id: string) => void;
  onChange: () => Promise<void>;
};

/**
 * The maps of one element of the atlas. A region shows its map with its areas and places; an area, a place and a scene show
 * where they are, and a place also shows its own map with its scenes. The DM draws and places on them; a player only looks.
 */
export function ElementMap({ worldId, isDm, tree, links, collection, id, onPick, onChange }: Props) {
  const { error, run } = useGuarded();
  const [active, setActive] = useState<Action | null>(null);
  // Something drawn or placed that still needs a name before it exists.
  const [pending, setPending] = useState<{ action: Action; polygon?: MapPoint[]; pin?: MapPoint } | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // The exit picked on the map, to be taken away.
  const [arrowId, setArrowId] = useState<string | null>(null);
  const found = locate(tree, id);

  const sections = ((): Section[] => {
    const { region, area, place, scene } = found;
    const areaShapes = (selectedId: string | null): MapShape[] =>
      (region?.areas ?? []).flatMap((a) => (a.polygon == null ? [] : [{ id: a.id, label: a.name, polygon: a.polygon, selected: a.id === selectedId }]));
    const placePins = (areas: AreaView[], selectedId: string | null): MapPin[] =>
      areas.flatMap((a) => a.places.flatMap((p) => (p.pin == null ? [] : [{ id: p.id, label: p.name, at: p.pin, selected: p.id === selectedId, kind: "place" as const }])));
    const scenePins = (from: PlaceView, selectedId: string | null): MapPin[] =>
      from.scenes.flatMap((s) => (s.pin == null ? [] : [{ id: s.id, label: s.name, at: s.pin, selected: s.id === selectedId, kind: "scene" as const }]));
    const regionOwner = (r: RegionView): Section["owner"] => ({ collection: "regions", id: r.id, name: r.name });
    // The exits between two scenes that are both pinned on the map of this place; the others are in the list of the scene.
    const exitArrows = (from: PlaceView): MapArrow[] => {
      const pinned = new Map(from.scenes.flatMap((s) => (s.pin == null ? [] : [[s.id, s] as const])));
      return (isDm ? links : []).flatMap((link) => {
        const a = pinned.get(link.fromSceneId);
        const b = pinned.get(link.toSceneId);
        if (a?.pin == null || b?.pin == null) return [];
        const names = { from: a.name, to: b.name };
        return [{ id: link.id, from: a.pin, to: b.pin, label: link.label === "" ? t("ui.world.atlas.exit-label", names) : t("ui.world.atlas.exit-label-named", { ...names, label: link.label }), selected: link.id === arrowId }];
      });
    };
    const exitChoice = (from: PlaceView): Choice[] =>
      from.scenes.filter((s) => s.pin != null).length >= 2 ? [{ action: { kind: "new-exit", placeId: from.id }, label: t("ui.world.atlas.add-exit") }] : [];

    if (collection === "regions" && region !== null) {
      return [{
        key: "region", title: t("ui.world.atlas.region-map"), mapImageId: region.mapImageId ?? null, owner: regionOwner(region), ownsMap: true,
        shapes: areaShapes(null), pins: placePins(region.areas, null), arrows: [],
        choices: [{ action: { kind: "new-area", regionId: region.id }, label: t("ui.world.atlas.draw-area") }],
      }];
    }
    if (collection === "areas" && region !== null && area !== null) {
      const placed = area.polygon != null;
      const addPlace: Choice[] = placed ? [{ action: { kind: "new-place", areaId: area.id }, label: t("ui.world.atlas.add-place") }] : [];
      return [{
        key: "area", title: t("ui.world.atlas.region-map"), mapImageId: region.mapImageId ?? null, owner: regionOwner(region), ownsMap: false,
        shapes: areaShapes(area.id), pins: placePins([area], null), arrows: [],
        choices: [
          { action: { kind: "redraw-area", areaId: area.id }, label: t(placed ? "ui.world.atlas.redraw-area" : "ui.world.atlas.place-now") },
          ...addPlace,
        ],
        inside: area.polygon ?? undefined,
        unavailable: region.mapImageId == null,
      }];
    }
    if (collection === "places" && region !== null && area !== null && place !== null) {
      const placed = place.pin != null;
      return [
        {
          key: "position", title: t("ui.world.atlas.position-region"), mapImageId: region.mapImageId ?? null, owner: regionOwner(region), ownsMap: false,
          shapes: area.polygon == null ? [] : [{ id: area.id, label: area.name, polygon: area.polygon, selected: true }],
          pins: placed && place.pin != null ? [{ id: place.id, label: place.name, at: place.pin, selected: true, kind: "place" as const }] : [],
          arrows: [],
          choices: [{ action: { kind: "move-place", placeId: place.id }, label: t(placed ? "ui.world.atlas.move-pin" : "ui.world.atlas.place-now") }],
          inside: area.polygon ?? undefined,
          unavailable: region.mapImageId == null || area.polygon == null,
        },
        {
          key: "own", title: t("ui.world.atlas.place-map"), mapImageId: place.mapImageId ?? null, owner: { collection: "places", id: place.id, name: place.name }, ownsMap: true,
          shapes: [], pins: scenePins(place, null), arrows: exitArrows(place),
          choices: [{ action: { kind: "new-scene", placeId: place.id }, label: t("ui.world.atlas.add-scene") }, ...exitChoice(place)],
        },
      ];
    }
    if (collection === "scenes" && place !== null && scene !== null) {
      const placed = scene.pin != null;
      return [{
        key: "scene", title: t("ui.world.atlas.position-place"), mapImageId: place.mapImageId ?? null, owner: { collection: "places", id: place.id, name: place.name }, ownsMap: false,
        shapes: [], pins: scenePins(place, scene.id), arrows: exitArrows(place),
        choices: [{ action: { kind: "move-scene", sceneId: scene.id }, label: t(placed ? "ui.world.atlas.move-pin" : "ui.world.atlas.place-now") }, ...exitChoice(place)],
        unavailable: place.mapImageId == null,
      }];
    }
    return [];
  })();

  const finish = async (work: () => Promise<unknown>): Promise<void> => {
    setNote(null);
    const ok = await run(async () => { await work(); });
    if (ok) {
      setActive(null);
      setPending(null);
      setName("");
      await onChange();
    }
  };

  const drawn = (polygon: MapPoint[]): void => {
    if (active?.kind === "redraw-area") {
      const areaId = active.areaId;
      void finish(() => api.updateElement(worldId, "areas", areaId, { polygon }));
    } else if (active?.kind === "new-area") setPending({ action: active, polygon });
  };

  const placed = (pin: MapPoint): void => {
    if (active?.kind === "move-place") {
      const placeId = active.placeId;
      void finish(() => api.updateElement(worldId, "places", placeId, { pin }));
    } else if (active?.kind === "move-scene") {
      const sceneId = active.sceneId;
      void finish(() => api.updateElement(worldId, "scenes", sceneId, { pin }));
    } else if (active?.kind === "new-place" || active?.kind === "new-scene") setPending({ action: active, pin });
  };

  const create = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (pending === null) return;
    const { action } = pending;
    const made = async (): Promise<string> => {
      if (action.kind === "new-area" && pending.polygon !== undefined) return (await api.createElement(worldId, "areas", { name, parentId: action.regionId, polygon: pending.polygon })).id;
      if (action.kind === "new-place" && pending.pin !== undefined) return (await api.createElement(worldId, "places", { name, parentId: action.areaId, pin: pending.pin })).id;
      if (action.kind === "new-scene" && pending.pin !== undefined) return (await api.createElement(worldId, "scenes", { name, parentId: action.placeId, pin: pending.pin })).id;
      throw new Error("Nothing to create");
    };
    void (async () => {
      let createdId = "";
      await finish(async () => { createdId = await made(); });
      if (createdId !== "") onPick(createdId);
    })();
  };

  const upload = async (section: Section, file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    await finish(async () => {
      const image = await api.uploadImage(worldId, "map", file);
      await api.updateElement(worldId, section.owner.collection, section.owner.id, { mapImageId: image.id });
    });
  };

  const moved = (pin: MapPin, at: MapPoint): void => {
    void finish(() => api.updateElement(worldId, pin.kind === "place" ? "places" : "scenes", pin.id, { pin: at }));
  };

  const linked = (fromId: string, toId: string): void => {
    void finish(() => api.createSceneLink(worldId, { fromSceneId: fromId, toSceneId: toId, label: "" }));
  };

  const modeFor = (section: Section): MapMode => {
    const mine = section.choices.find((c) => same(active, c.action));
    if (mine === undefined) return { kind: "view" };
    if (mine.action.kind === "new-exit") return { kind: "link" };
    if (mine.action.kind === "new-area" || mine.action.kind === "redraw-area") return { kind: "draw" };
    return { kind: "pin", inside: mine.action.kind === "new-scene" || mine.action.kind === "move-scene" ? undefined : section.inside };
  };

  const hintFor = (action: Action): string => (action.kind === "new-area" || action.kind === "redraw-area" ? t("ui.world.atlas.draw-hint") : action.kind === "new-exit" ? t("ui.world.atlas.exit-hint") : t("ui.world.atlas.pin-hint"));
  const arrowPicked = sections.flatMap((s) => s.arrows).find((a) => a.id === arrowId);

  if (sections.length === 0) return null;
  return (
    <div className="stack">
      {sections.filter((section) => section.unavailable !== true).map((section) => {
        const label = (text: string): string => `${text}: ${section.owner.name}`;
        const mode = modeFor(section);
        const busy = mode.kind !== "view";
        return (
          <section key={section.key} className="stack tight">
            <h3 className="section-title">{section.title}</h3>
            {section.mapImageId === null ? (
              <>
                <p className="muted small">{t("ui.world.atlas.no-map")}</p>
                {isDm && <MapUpload label={t(section.owner.collection === "regions" ? "ui.world.atlas.upload-region" : "ui.world.atlas.upload-place")} onFile={(file) => { void upload(section, file); }} />}
              </>
            ) : (
              <>
                <MapCanvas
                  src={imageUrl(worldId, section.mapImageId)}
                  alt={t("ui.world.atlas.map", { name: section.owner.name })}
                  shapes={section.shapes}
                  pins={section.pins}
                  arrows={section.arrows}
                  mode={mode}
                  movable={isDm}
                  onShape={onPick}
                  onPin={onPick}
                  onDrawn={drawn}
                  onPlaced={placed}
                  onRefused={() => { setNote(t("ui.world.atlas.pin-outside")); }}
                  onArrow={(picked) => { setArrowId(arrowId === picked ? null : picked); }}
                  onLink={linked}
                  onMovePin={(pinId, at) => { const pin = section.pins.find((p) => p.id === pinId); if (pin !== undefined) moved(pin, at); }}
                />
                {busy && active !== null && <p className="muted small" role="status">{hintFor(active)}</p>}
                {busy && note !== null && <p role="alert" className="notice">{note}</p>}
                {isDm && (
                  <div className="row">
                    {section.choices.map((choice) => (
                      <button key={choice.label} type="button" className="btn quiet small" aria-pressed={same(active, choice.action)} onClick={() => { setNote(null); setPending(null); setActive(same(active, choice.action) ? null : choice.action); }}>
                        {choice.label}
                      </button>
                    ))}
                    {section.ownsMap && (
                      <>
                        <MapUpload label={t("ui.world.atlas.change-map")} onFile={(file) => { void upload(section, file); }} />
                        <button type="button" className="btn quiet small" aria-label={label(t("ui.world.atlas.remove-map"))} onClick={() => { void finish(() => api.updateElement(worldId, section.owner.collection, section.owner.id, { mapImageId: null })); }}>
                          {t("ui.world.atlas.remove-map")}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}
      {isDm && arrowPicked !== undefined && (
        <div className="row">
          <p>{arrowPicked.label}</p>
          <button type="button" className="btn danger small" onClick={() => { const gone = arrowPicked.id; setArrowId(null); void finish(() => api.deleteSceneLink(worldId, gone)); }}>{t("ui.world.atlas.remove-exit")}</button>
        </div>
      )}
      {pending !== null && (
        <form className="row" onSubmit={create}>
          <input style={{ flex: 1, minWidth: "9rem", width: "auto" }} aria-label={t("ui.world.atlas.name-new")} placeholder={t("ui.world.atlas.name-new")} value={name} onChange={(e) => { setName(e.target.value); }} maxLength={120} required autoFocus />
          <button type="submit" className="btn small">{t("ui.world.atlas.create")}</button>
          <button type="button" className="btn quiet small" onClick={() => { setPending(null); setActive(null); setName(""); }}>{t("ui.world.atlas.cancel")}</button>
        </form>
      )}
      {error !== null && <p role="alert" className="notice">{error}</p>}
    </div>
  );
}

function MapUpload({ label, onFile }: { label: string; onFile: (file: File | undefined) => void }) {
  return (
    <label className="field">
      {label}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; onFile(file); }} />
    </label>
  );
}
