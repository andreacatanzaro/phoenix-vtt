/**
 * Italian catalog: the only place user-facing text lives.
 * Keys are dotted paths (`area.element.field`); `{name}` marks a named parameter.
 */
export const it = {
  roll: {
    mode: {
      normal: "normale",
      advantage: "con vantaggio",
      disadvantage: "con svantaggio",
    },
  },
  // Italian skill names, confirmed by the author.
  skills: {
    acrobatics: "Acrobazia",
    "animal-handling": "Addestrare animali",
    arcana: "Arcano",
    athletics: "Atletica",
    deception: "Inganno",
    history: "Storia",
    insight: "Intuizione",
    intimidation: "Intimidire",
    investigation: "Investigare",
    medicine: "Medicina",
    nature: "Natura",
    perception: "Percezione",
    performance: "Intrattenere",
    persuasion: "Persuasione",
    religion: "Religione",
    "sleight-of-hand": "Rapidità di mano",
    stealth: "Furtività",
    survival: "Sopravvivenza",
  },
  // Italian ability names, confirmed by the author.
  abilities: {
    str: "Forza",
    dex: "Destrezza",
    con: "Costituzione",
    int: "Intelligenza",
    wis: "Saggezza",
    cha: "Carisma",
  },
  // Italian damage type names, confirmed by the author.
  damageTypes: {
    acid: "acido",
    bludgeoning: "contundente",
    cold: "freddo",
    fire: "fuoco",
    force: "forza",
    lightning: "fulmine",
    necrotic: "necrotico",
    piercing: "perforante",
    poison: "veleno",
    psychic: "psichico",
    radiant: "radioso",
    slashing: "tagliente",
    thunder: "tuono",
  },
  common: {
    yes: "Sì",
    no: "No",
  },
  log: {
    d20: {
      success: "Tiro {total} contro CD {dc}: successo.",
      failure: "Tiro {total} contro CD {dc}: fallimento.",
      "natural-success": "20 naturale: successo automatico (totale {total}, CD {dc}). Segnalato al DM.",
      "natural-failure": "1 naturale: fallimento automatico (totale {total}, CD {dc}). Segnalato al DM.",
    },
    attack: {
      hit: "Attacco {total} contro CA {ac}: colpito.",
      miss: "Attacco {total} contro CA {ac}: mancato.",
      "critical-hit": "20 naturale: colpo critico (totale {total}, CA {ac}). Segnalato al DM.",
      "critical-miss": "1 naturale: mancato automaticamente (totale {total}, CA {ac}). Segnalato al DM.",
    },
    damage: {
      part: "Danno {amount} {type}: dadi [{dice}], bonus {bonus}.",
      critical: "Colpo critico: dadi e bonus ai danni raddoppiati.",
      total: "Danno totale: {total}.",
    },
    defense: {
      resistance: "Resistenza al danno {type}: {before} dimezzato a {after}.",
      vulnerability: "Vulnerabilità al danno {type}: {before} raddoppiato a {after}.",
      immunity: "Immunità al danno {type}: {before} annullato a {after}.",
    },
    roll: {
      detail: "Tiro {notation} ({mode}): dadi [{dice}], tenuti [{kept}], modificatore {modifier}, totale {total}.",
    },
    effect: {
      expired: "L'effetto {effect} su {target} è terminato.",
      "round-passed": "È passato un round: l'effetto {effect} su {target} dura ancora {remaining} round.",
    },
    step: {
      unexplained: "Il passo {step} ha modificato lo stato senza una spiegazione.",
    },
    dm: {
      override: "Il DM ha corretto un passo ({kind} su {target}).",
    },
  },
} as const;
