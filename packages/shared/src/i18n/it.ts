/**
 * Italian catalog: the only place user-facing text lives.
 * Keys are dotted paths (`area.element.field`); `{name}` marks a named parameter.
 */
export const it = {
  common: {
    yes: "Sì",
    no: "No",
  },
  log: {
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
