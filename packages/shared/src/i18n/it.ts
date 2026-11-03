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
  // Class texts come from the official Italian SRD 5.1 (CC BY 4.0, see docs/SRD-ATTRIBUTION.md).
  classes: {
    fighter: {
      name: "Guerriero",
      prompts: {
        "fighting-style": "Scegli uno stile di combattimento.",
        "additional-fighting-style": "Scegli un secondo stile di combattimento, diverso dal primo.",
        indomitable: "Hai fallito un tiro salvezza: vuoi usare Indomabile per ripeterlo?",
        "great-weapon-fighting": "Alcuni dadi di danno hanno dato 1 o 2: vuoi ripeterli? Dovrai usare il nuovo risultato.",
      },
      notes: {
                protection: "Protezione: il DM verifica lo scudo e la distanza e applica lo svantaggio all'attacco quando il guerriero usa la reazione.",
        "remarkable-athlete": "Atleta Straordinario: il bonus alle prove è automatico; l'aumento del salto in lungo con rincorsa lo applica il DM.",
        "extra-attack": "Attacco Extra: il sistema indica quanti attacchi spettano; è il giocatore a effettuarli con l'azione Attacco.",
      },
      features: {
        "second-wind": {
          name: "Recuperare Energie",
          description:
            "Un guerriero possiede una riserva limitata di resistenza fisica a cui può attingere per proteggersi dai danni. Nel suo turno può usare un'azione bonus per recuperare un ammontare di punti ferita pari a 1d10 + il suo livello da guerriero. Una volta utilizzato questo privilegio, il guerriero non può più utilizzarlo finché non completa un riposo breve o lungo.",
        },
        "fighting-style": {
          name: "Stile di Combattimento",
          description:
            "Un guerriero adotta uno stile di combattimento in cui specializzarsi scegliendo una tra le opzioni seguenti. Non è consentito scegliere uno stile di combattimento più di una volta, anche se in seguito il guerriero ha diritto a scegliere di nuovo.",
        },
        "action-surge": {
          name: "Azione Impetuosa",
          description:
            "A partire dal 2° livello, un guerriero può spingersi oltre i suoi normali limiti per un istante. Nel suo turno può effettuare un'azione aggiuntiva e una possibile azione bonus. Una volta utilizzato questo privilegio, il guerriero non può più utilizzarlo finché non completa un riposo breve o lungo. A partire dal 17° livello, il guerriero può utilizzare questo privilegio due volte prima di un riposo, ma soltanto una volta nello stesso turno.",
        },
        "extra-attack": {
          name: "Attacco Extra",
          description:
            "A partire dal 5° livello, un guerriero può attaccare due volte anziché una, ogni volta che effettua l'azione Attacco nel proprio turno. Il numero di attacchi aumenta a tre quando il guerriero arriva all'11° livello e a quattro quando arriva al 20° livello.",
        },
        indomitable: {
          name: "Indomabile",
          description:
            "A partire dal 9° livello, un guerriero può ripetere un tiro salvezza che ha fallito. Se lo fa, deve usare il nuovo risultato e non può più utilizzare questo privilegio finché non completa un riposo lungo. Un guerriero può utilizzare questo privilegio due volte tra un riposo lungo e l'altro a partire dal 13° livello e tre volte tra un riposo lungo e l'altro a partire dal 17° livello.",
        },
      },
      styles: {
        archery: { name: "Tiro", description: "Il guerriero ottiene un bonus di +2 ai tiri per colpire che effettua con le armi a distanza." },
        defense: { name: "Difesa", description: "Finché indossa un'armatura, il guerriero ottiene un bonus di +1 alla CA." },
        dueling: {
          name: "Duellare",
          description: "Quando il guerriero impugna un'arma da mischia in una mano e non impugna altre armi, ottiene un bonus di +2 ai tiri per i danni di quell'arma.",
        },
        "great-weapon-fighting": {
          name: "Combattere con Armi Possenti",
          description:
            "Quando il guerriero ottiene un 1 o un 2 a un tiro per i danni di un attacco che ha effettuato con un'arma da mischia impugnata a due mani, può ripetere il tiro e deve usare il nuovo risultato, anche se ottiene ancora un 1 o un 2. L'arma deve possedere la proprietà a due mani o versatile affinché il guerriero ottenga questo beneficio.",
        },
        protection: {
          name: "Protezione",
          description:
            "Quando una creatura che il guerriero sia in grado di vedere attacca un bersaglio diverso dal guerriero e situato entro 1,5 metri da lui, il guerriero può usare la sua reazione per infliggere svantaggio al tiro per colpire della creatura. Il guerriero deve impugnare uno scudo.",
        },
        "two-weapon-fighting": {
          name: "Combattere con Due Armi",
          description: "Quando il guerriero combatte con due armi, può aggiungere il suo modificatore di caratteristica ai danni del secondo attacco.",
        },
      },
      subclasses: {
        champion: {
          name: "Campione",
          description:
            "L'archetipo del Campione è incentrato sullo sviluppo della potenza fisica allo stato puro, affinata fino a raggiungere una letale perfezione. Un guerriero modellato su questo archetipo unisce un rigoroso addestramento a una condizione fisica eccellente per infliggere colpi devastanti.",
          features: {
            "improved-critical": {
              name: "Critico Migliorato",
              description: "A partire da quando il guerriero sceglie questo archetipo al 3° livello, i suoi attacchi con un'arma mettono a segno un colpo critico con un risultato di 19 o 20 al tiro.",
            },
            "remarkable-athlete": {
              name: "Atleta Straordinario",
              description:
                "A partire dal 7° livello, il guerriero può aggiungere metà del suo bonus di competenza (arrotondato per eccesso) a qualsiasi prova di Forza, Destrezza o Costituzione che effettua e che non utilizzi già il suo bonus di competenza. Inoltre, quando il guerriero effettua un salto in lungo con rincorsa, la distanza che copre aumenta di un numero di metri pari al suo modificatore di Forza.",
            },
            "additional-fighting-style": {
              name: "Stile di Combattimento Aggiuntivo",
              description: "Al 10° livello, il guerriero può scegliere una seconda opzione dal privilegio di classe Stile di Combattimento.",
            },
            "superior-critical": {
              name: "Critico Superiore",
              description: "A partire dal 15° livello, gli attacchi con arma del guerriero mettono a segno un colpo critico con un risultato di 18–20 al tiro.",
            },
            survivor: {
              name: "Sopravvissuto",
              description:
                "Al 18° livello, il guerriero giunge all'apice della sua resilienza in battaglia. All'inizio di ogni suo turno, recupera un ammontare di punti ferita pari a 5 + il suo modificatore di Costituzione, se non gli rimane più della metà dei suoi punti ferita. Non ottiene questo beneficio se ha 0 punti ferita.",
            },
          },
        },
      },
    },
  },
  // Action names as in the Italian SRD 5.1.
  actions: {
    attack: { name: "Attacco" },
    dash: { name: "Scatto" },
    disengage: { name: "Disimpegno" },
    dodge: { name: "Schivata" },
    help: { name: "Aiuto" },
    hide: { name: "Nascondersi" },
    search: { name: "Cercare" },
    "use-object": { name: "Usare un oggetto" },
    "cast-spell": { name: "Lanciare un incantesimo" },
    ready: { name: "Prepararsi" },
  },
  reactions: {
    "opportunity-attack": { prompt: "Una creatura lascia la tua portata: vuoi usare la reazione per un attacco di opportunità?" },
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
    check: {
      "auto-fail": "{actor} fallisce da solo la prova: una condizione glielo impedisce.",
    },
    attack: {
      declared: "{actor} attacca {target}.",
      forbidden: "{actor} non può attaccare {target}: lo impedisce una condizione.",
      "no-attacks": "{actor} non ha attacchi rimasti: serve prima l'azione Attacco.",
      "two-weapon-invalid": "{actor} non può attaccare con l'azione bonus: servono prima un attacco e due armi da mischia leggere, una per mano.",
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
      unregistered: "{actor} non è registrato nel combattimento: nessuna azione disponibile.",
      damaged: "Lo stato del turno di {actor} non è valido: va registrato di nuovo.",
      resumed: "{actor} riprende il proprio turno.",
      "surprised-start": "{actor} è sorpreso: non potrà muoversi né agire nel primo turno, né reagire finché non finisce.",
      surprised: "{actor} è sorpreso: in questo turno non può muoversi né effettuare azioni, e non può reagire.",
      "surprise-over": "{actor} non è più sorpreso: può reagire di nuovo.",
      ended: "{actor} termina il turno.",
      ready: "{actor} ha azione, azione bonus, reazione e {meters} m di movimento.",
      incapacitated: "{actor} è incapacitato: nessuna azione né reazione in questo turno.",
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
    action: {
      used: "{actor} effettua l'azione {action}.",
      refused: "{actor} non può effettuare l'azione {action}: non ha più azioni disponibili in questo turno.",
      "not-your-turn": "{actor} non può effettuare l'azione {action}: non è il suo turno.",
      incapacitated: "{actor} non può effettuare l'azione {action}: è incapacitato.",
      redundant: "{actor} ha già in corso l'effetto di {action}: l'azione non viene spesa.",
      invalid: "I dati dell'azione {action} di {actor} non sono validi: nulla è stato speso né risolto.",
      unknown: "Azione non riconosciuta o dati mancanti: nulla è stato risolto.",
      "dm-resolves": "{actor}: l'esito dell'azione {action} lo stabilisce il DM.",
      "ready-released": "{actor} libera l'azione preparata con la sua reazione: {description}",
      "not-readied": "{actor} non ha un'azione preparata da eseguire: serve prima liberarla con la reazione.",
    },
    movement: {
      moved: "{actor} si muove di {meters} m ({left} m rimasti).",
      refused: "{actor} non ha abbastanza movimento per spostarsi di {meters} m.",
    },
    reaction: {
      "opportunity-denied": "{actor} non può effettuare un attacco di opportunità contro {target}: ha usato Disimpegno.",
      "opportunity-chosen": "{actor} sceglie di effettuare un attacco di opportunità contro {target}.",
      "opportunity-attack": "{actor} usa la reazione per un attacco di opportunità contro {target}.",
      refused: "{actor} non ha una reazione disponibile.",
    },
    feature: {
      refused: "{actor} non può usare {feature}: non ha usi o azioni disponibili.",
      "missing-data": "{actor}: mancano i dati necessari per {feature}, quindi non ha effetto.",
    },
    class: {
      "level-invalid": "Livello non valido per {actor}: i livelli vanno da 1 a 20, nulla è stato aggiornato.",
      "attacks-per-action": "{actor} ora effettua {attacks} attacchi con l'azione Attacco.",
      "great-weapon-reroll": "{actor} ripete i dadi di danno che avevano dato 1 o 2: danno totale {total}.",
      "uses-restored": "{actor} recupera gli usi delle capacità di classe.",
      "critical-range": "{actor} mette a segno un colpo critico con un risultato di {from} o più.",
      "second-wind": "{actor} recupera energie: tira {rolled}, più {level} (livello): {total} PF.",
      "action-surge": "{actor} usa Azione Impetuosa e può effettuare un'azione aggiuntiva.",
      indomitable: "{actor} ripete il tiro salvezza fallito con Indomabile.",
      survivor: "{actor} si rimette in sesto con Sopravvissuto: recupera {amount} PF.",
    },
    level: {
      up: "{actor} sale al livello {level}.",
      "hit-points": "{actor} guadagna {gained} PF massimi (ora {hpMax}).",
    },
    step: {
      unexplained: "Il passo {step} ha modificato lo stato senza una spiegazione.",
    },
    dm: {
      override: "Il DM ha corretto un passo ({kind} su {target}).",
    },
  },
} as const;
