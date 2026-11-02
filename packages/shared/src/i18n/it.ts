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
  // Italian condition names, confirmed by the author.
  conditions: {
    blinded: "Accecato",
    charmed: "Affascinato",
    deafened: "Assordato",
    exhaustion: "Indebolimento",
    frightened: "Spaventato",
    grappled: "Afferrato",
    incapacitated: "Incapacitato",
    invisible: "Invisibile",
    paralyzed: "Paralizzato",
    petrified: "Pietrificato",
    poisoned: "Avvelenato",
    prone: "Prono",
    restrained: "Trattenuto",
    stunned: "Stordito",
    unconscious: "Privo di sensi",
  },
  // What the system leaves to the DM for each condition (proposed wording).
  conditionNotices: {
    "blinded.checks": "Accecato: fallisce da solo le prove che richiedono la vista. Lo applica il DM.",
    "deafened.checks": "Assordato: fallisce da solo le prove che richiedono l'udito. Lo applica il DM.",
    "frightened.sight": "Spaventato: svantaggio a prove e attacchi finché vede la fonte della paura. Il DM verifica la vista.",
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
    initiative: {
      result: "{actor} tira iniziativa: {total}.",
      "tie-players": "Parità a {total} per {actor}: i giocatori decidono l'ordine.",
      "tie-dm": "Parità a {total} per {actor}: il DM decide l'ordine.",
    },
    turn: {
      start: "Inizia il turno di {actor} (round {round}).",
      resume: "{actor} riprende il turno interrotto (round {round}).",
      "join-now": "{actor} entra in combattimento con iniziativa {total} e agisce subito (round {round}).",
      "join-later": "{actor} entra in combattimento con iniziativa {total} e agirà al suo posto nel round {round}.",
    },
    roll: {
      detail: "Tiro {notation} ({mode}): dadi [{dice}], tenuti [{kept}], modificatore {modifier}, totale {total}.",
    },
    rest: {
      "hit-die-spent": "{actor} spende un Dado Vita (d{size}): tira {rolled}. Dadi Vita rimasti: {remaining}/{total}.",
      short: "{actor} termina un riposo breve.",
      long: "{actor} termina un riposo lungo: PF al massimo, {regained} Dadi Vita recuperati.",
      "too-soon": "{actor} non ottiene i benefici del riposo lungo: sono passate solo {hours} ore dall'ultimo.",
      "no-hp": "{actor} non può trarre beneficio da un riposo lungo con 0 PF.",
      "exhaustion-reduced": "{actor} riposa bene: l'Indebolimento scende al livello {level}.",
      "not-fed": "{actor} non ha mangiato e bevuto a sufficienza: l'Indebolimento non scende.",
    },
    hp: {
      lost: "{actor} perde {amount} PF ({hp}/{hpMax}).",
      gained: "{actor} recupera {amount} PF ({hp}/{hpMax}).",
    },
    death: {
      drops: "{actor} scende a 0 PF e cade privo di sensi: inizia i tiri salvezza contro morte.",
      "knocked-out": "{actor} è messo fuori combattimento: privo di sensi ma stabile a 0 PF.",
      instant: "{actor} subisce un danno che supera i PF massimi: muore sul colpo.",
      "no-saves": "{actor} scende a 0 PF e muore.",
      "damage-at-zero": "{actor} subisce danno a 0 PF: {added} fallimento ai tiri salvezza contro morte ({failures}/3).",
      unstable: "{actor} subisce danno: non è più stabile e ricomincia i tiri salvezza contro morte.",
      "save-success": "Tiro salvezza contro morte di {actor}: successo (successi {successes}/3, fallimenti {failures}/3).",
      "save-failure": "Tiro salvezza contro morte di {actor}: fallimento (successi {successes}/3, fallimenti {failures}/3).",
      "natural-1": "1 naturale al tiro salvezza contro morte: {actor} muore direttamente. Segnalato al DM.",
      "natural-20": "20 naturale al tiro salvezza contro morte: {actor} recupera 1 PF e riprende i sensi. Segnalato al DM.",
      stable: "{actor} è stabile: privo di sensi, senza altri tiri salvezza contro morte.",
      dead: "{actor} è morto.",
      healed: "{actor} recupera {amount} PF e riprende i sensi.",
      "recovery-scheduled": "{actor} si riprenderà tra {hours} ore.",
    },
    condition: {
      applied: "{target} subisce la condizione {condition}.",
      immune: "{target} è immune alla condizione {condition}.",
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
