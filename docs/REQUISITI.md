# Requisiti, ondate e test

Ogni requisito di AGENTS.md con l'ondata in cui si consegna, lo stato e i test che lo verificano. Un test del repository (`scripts/requisiti.test.ts`) controlla che ogni file di test citato esista. Stato: **fatto**, **parziale** (una parte è consegnata, il resto è nell'ondata indicata), **da fare**.

## Ondata 1 — Fondamenta

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Monorepo pnpm, TypeScript strict, `pnpm test/typecheck/lint` | §3 | fatto | verificato da CI (`.github/workflows/ci.yml`) |
| Grafo delle dipendenze tra pacchetti imposto dal lint | §3 | fatto | verificato da `pnpm lint` |
| Motore e regole SRD puri: niente `Math.random`, orologio, rete, IO | §3, §5 | fatto | verificato da `pnpm lint` |
| Motore: eventi con ganci a priorità | §5 | fatto | `packages/rules-core/src/engine.test.ts` |
| Motore: pila di effetti attivi (durate, non cumulo) | §5 | fatto | `packages/rules-core/src/effects.test.ts`, `packages/rules-core/src/engine.test.ts` |
| Motore: richieste di decisione con pausa e ripresa | §5 | fatto | `packages/rules-core/src/engine.test.ts` |
| Motore: override del DM e log leggibile di ogni passo | §5 | fatto | `packages/rules-core/src/engine.test.ts` |
| Motore: stato serializzabile e archivio di stato | §3, §5 | fatto | `packages/rules-core/src/engine.test.ts` |
| Casualità iniettata e dadi con notazione standard | §5 | fatto | `packages/rules-core/src/rng.test.ts`, `packages/rules-core/src/dice.test.ts` |
| Testi solo nel catalogo italiano, log con chiavi | §4 | fatto | `packages/shared/src/i18n/i18n.test.ts` |
| Unità di misura in un solo file (metri, kg) | §7 | fatto | `packages/shared/src/units.test.ts` |
| Prove d20, vantaggio e svantaggio, 20 e 1 naturali | §7 | fatto | `packages/rules-srd/src/d20-test.test.ts`, `packages/rules-srd/src/roll-mode.test.ts` |
| Caratteristiche, abilità, bonus di competenza | §7 | fatto | `packages/rules-srd/src/abilities.test.ts`, `packages/rules-srd/src/skills.test.ts` |
| Iniziativa, parità e ingresso a combattimento in corso | §7 | fatto | `packages/rules-srd/src/initiative.test.ts`, `packages/rules-srd/src/turns.test.ts` |
| Attacchi, colpo critico, danni, resistenze | §7 | fatto | `packages/rules-srd/src/attack.test.ts`, `packages/rules-srd/src/damage.test.ts` |
| Le 15 condizioni e le loro consultazioni | §7, §13 | fatto | `packages/rules-srd/src/conditions.test.ts`, `packages/rules-srd/src/condition-rules.test.ts`, `packages/rules-srd/src/condition-apply.test.ts`, `packages/rules-srd/src/condition-movement.test.ts` |
| Morte, tiri salvezza contro morte, stabilizzazione | §7 | fatto | `packages/rules-srd/src/death.test.ts` |
| Riposi, Dadi Vita e orologio di gioco | §7 | fatto | `packages/rules-srd/src/rest.test.ts`, `packages/rules-srd/src/game-time.test.ts`, `packages/rules-srd/src/hit-points.test.ts` |
| Una classe di prova nei test (fuori da `content/`) | §6 | fatto | `packages/rules-srd/src/class-model.test.ts`, `packages/rules-srd/src/features.test.ts` |
| Account con nome utente e password (argon2) | §3, §8 | fatto | `apps/server/src/app.test.ts` |
| Sessione con cookie `httpOnly`, `secure` configurabile, `sameSite=lax` | §3 | fatto | `apps/server/src/app.test.ts` |
| Limite ai tentativi di accesso falliti | §8 | fatto | `apps/server/src/auth/throttle.test.ts`, `apps/server/src/app.test.ts` |
| Mondo e appartenenza con ruolo; un solo DM per mondo | §9 | fatto | `apps/server/src/app.test.ts` |
| Configurazione solo da variabili d'ambiente | §11 | fatto | `apps/server/src/config.test.ts` |
| Endpoint `/health` e log strutturati in JSON | §11 | fatto | `apps/server/src/app.test.ts` |
| Il server serve anche il client (un solo servizio) | §11 | fatto | `apps/server/src/app.test.ts` |
| Migrazioni SQL versionate (Drizzle) | §3, §11 | fatto | `apps/server/src/app.test.ts` (le migrazioni vengono applicate a ogni test) |
| Scheletro del client: accesso, registrazione, mondi, testi italiani | §10 | fatto | `apps/client/src/App.test.tsx`, `apps/client/src/api.test.ts` |
| `docker compose` locale (PostgreSQL, server, client) e `Dockerfile` multi-stage `dev`/`prod` | §11 | fatto | provato a mano: build di `prod`, `/health`, registrazione, client con proxy; la build di `prod` è anche in CI |
| Integrazione continua | §13 | fatto | `.github/workflows/ci.yml` |
| Rapporto di copertura dei contenuti aggiornato | §6 | fatto | `packages/content/src/registry.test.ts` (e `pnpm coverage:check` in CI) |
| Attribuzione dell'SRD 5.1 | §12 | fatto | `docs/SRD-ATTRIBUTION.md` (documento) |

## Ondata 2 — Personaggi

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Creazione guidata con i tre metodi per i punteggi | §7 | da fare | — |
| PF al livello 1 e per livello (tiro o media) | §7 | parziale: calcolo | `packages/rules-srd/src/class-model.test.ts` |
| Scheda con campi del giocatore e campi del mondo | §9 | da fare | — |
| Storico delle modifiche (fonte di verità della progressione) | §2 | da fare | — |
| Avanzamento di livello con scelte in sospeso | §7 | parziale: modello | `packages/rules-srd/src/class-model.test.ts` |
| Diario personale e diario dell'avventura | §9 | da fare | — |
| Creature legate a un personaggio e multiclasse nel modello | §9 | da fare | — |

## Ondata 3 — Tavolo minimo

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Scena, griglia da 1,5 m, token con aggancio | §10 | da fare | — |
| Dadi e chat in tempo reale, tiri riservati e sussurri | §10 | da fare | — |
| Riconnessione con stato corrente | §8 | da fare | — |

## Ondata 4 — Editor di scena e visione

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Muri, porte, luci, nebbia di guerra | §10 | da fare | — |
| Visione, luce e linea d'effetto calcolate dal server | §8 | da fare | — |

## Ondata 5 — Mondi e sessioni

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Gerarchia del mondo: regioni, aree, luoghi, scene | §9 | da fare | — |
| Collegamento tra scene e spostamento di tutti | §9 | da fare | — |
| Inviti, bacheca, iscrizioni alle sessioni | §10 | da fare | — |
| Chiusura di scena (XP e loot) e di sessione (cronaca) | §7 | da fare | — |

## Ondata 6 — Automazione del combattimento

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Turno, economia delle azioni, azioni di combattimento | §7 | fatto | `packages/rules-srd/src/turn-hooks.test.ts`, `packages/rules-srd/src/actor-turn.test.ts`, `packages/rules-srd/src/turn-economy.test.ts`, `packages/rules-srd/src/action-effects.test.ts` |
| Attacchi di opportunità, sorpresa, Prepararsi | §7 | fatto | `packages/rules-srd/src/turn-hooks.test.ts` |
| Danno applicato ai PF con difese | §7 | da fare | — |
| Tiri salvezza, concentrazione | §7 | da fare | — |
| Magia con aree, componenti | §6 | da fare | — |
| Geometria della scena (portata, linea d'effetto) | §5 | da fare | — |
| Trappole, veleni e malattie automatici | §7 | da fare | — |

## Ondata 7 — Contenuti

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Classi SRD 5.1 con sottoclassi | §6 | parziale: Guerriero e Campione | `packages/content/src/classes/fighter/fighter.test.ts`, `packages/content/src/classes/fighter/champion.test.ts`, `packages/content/src/classes/fighter/fighter-hooks.test.ts`, `packages/content/src/classes/fighter/fighting-styles.test.ts` |
| Razze, talenti, incantesimi, oggetti, mostri | §6 | da fare | — |

## Dopo l'ondata 7

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Pubblicazione su Railway | §11 | da fare | — |
