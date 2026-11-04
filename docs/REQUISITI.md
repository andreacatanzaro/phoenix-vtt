# Requisiti, ondate e test

Ogni requisito di AGENTS.md con l'ondata in cui si consegna, lo stato e i test che lo verificano. Un test del repository (`scripts/requisiti.test.ts`) controlla che ogni file di test citato esista. Le ondate sono nell'ordine di consegna di AGENTS.md (sezione 13): 1, 5a, 3, 4, 2, 5b, 6, 7. Stato: **fatto**, **parziale** (una parte è consegnata, il resto è nell'ondata indicata), **da fare**.

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

## Ondata 5a — Mondi e sessioni (prima parte, subito dopo la 1)

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Gerarchia del mondo: regioni, aree, luoghi, scene (il database impedisce un figlio in un altro mondo) | §9 | fatto | `apps/server/src/world-structure.test.ts`, `apps/client/src/WorldPage.test.tsx`, `apps/client/src/tree.test.ts` |
| Il giocatore vede solo ciò che il DM rivela (con tutti gli elementi sopra rivelati), mai le note del DM | §9 | fatto | `apps/server/src/world-structure.test.ts`, `apps/client/src/WorldPage.test.tsx` |
| Collegamento tra scene (anche tra luoghi, aree e regioni diversi; più uscite; solo il DM) | §9 | fatto | `apps/server/src/world-structure.test.ts`, `apps/client/src/WorldPage.test.tsx` |
| Ingresso dei giocatori: il DM li aggiunge per nome utente; elenco e rimozione | §9 | fatto | `apps/server/src/members.test.ts`, `apps/client/src/WorldPage.test.tsx` |
| Sessioni: creare, pubblicare, avviare, chiudere; una sola in corso per mondo; bacheca senza bozze per i giocatori | §10 | fatto | `apps/server/src/game-sessions.test.ts`, `apps/client/src/WorldPage.test.tsx` |
| Nota di cronaca a fine sessione | §7 | fatto | `apps/server/src/game-sessions.test.ts`, `apps/client/src/WorldPage.test.tsx` |

## Ondata 3 — Tavolo minimo

Il disegno della mappa con PixiJS (`apps/client/src/table/board-view.ts`) non si può provare in jsdom: la geometria è coperta da test, il disegno è stato verificato a mano in un browser vero.

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Immagine della mappa di una scena: caricamento con limite di dimensione e controllo del tipo | §8 | fatto | `apps/server/src/images.test.ts`, `apps/server/src/image-info.test.ts`, `apps/server/src/image-store.test.ts`, `apps/client/src/SceneTools.test.tsx` |
| Scena giocata con griglia (un quadretto = 1,5 m); pan e zoom | §10 | fatto | `apps/client/src/table/geometry.test.ts`, `apps/client/src/Board.test.tsx` |
| Token con aggancio alla griglia; solo i propri per il giocatore, tutti per il DM | §8, §10 | fatto | `apps/server/src/table.test.ts`, `apps/client/src/TokenPanel.test.tsx`, `apps/client/src/table/geometry.test.ts` |
| Token nascosti: li vede solo il DM | §8 | fatto | `apps/server/src/table.test.ts`, `apps/server/src/table/visibility.test.ts` |
| Filtro di visibilità nel protocollo: il server invia a ogni client solo ciò che può vedere | §8 | fatto | `apps/server/src/table/visibility.test.ts`, `apps/server/src/table.test.ts` |
| Dadi con notazione standard tirati dal server, tiri riservati e sussurri, log persistente | §8, §10 | fatto | `apps/server/src/table.test.ts`, `apps/server/src/table/crypto-rng.test.ts`, `apps/client/src/ChatPanel.test.tsx` |
| Chat in tempo reale | §10 | fatto | `apps/server/src/table.test.ts`, `apps/client/src/ChatPanel.test.tsx`, `apps/client/src/TablePage.test.tsx` |
| Riconnessione con stato corrente | §8 | fatto | `apps/server/src/table.test.ts`, `apps/client/src/table/connection.test.ts`, `apps/client/src/TablePage.test.tsx` |
| Spostamento di tutti da una scena all'altra (personaggi e PNG del party, zona di partenza) | §9 | fatto | `apps/server/src/table.test.ts`, `packages/shared/src/placement.test.ts`, `apps/client/src/SceneTools.test.tsx` |
| Chi esce dal mondo esce subito dal tavolo | §8 | fatto | `apps/server/src/table.test.ts` |
| Una scena con token o in gioco non si elimina; i comandi del tavolo e la chiusura della sessione sono eseguiti uno alla volta | §8, §9 | fatto | `apps/server/src/table.test.ts`, `apps/server/src/table/serial-queue.test.ts` |
| Le immagini non più usate si eliminano (riga e file) dopo un'ora di tolleranza | §8 | fatto | `apps/server/src/image-gc.test.ts` |
| Un giocatore scarica solo le immagini che vede ora (mappa della scena in gioco, volti dei token non nascosti) | §8 | fatto | `apps/server/src/images.test.ts` |
| La cronologia in riconnessione conta solo le righe che il lettore può vedere | §8, §10 | fatto | `apps/server/src/table.test.ts` |
| Il socket del tavolo non sopravvive al logout né alla scadenza del login; i frame in eccesso sono scartati prima di accodarli | §8 | fatto | `apps/server/src/table.test.ts`, `apps/server/src/table/frame-gate.test.ts` |
| Pulizia delle immagini senza perdite: prima la riga, poi il file; file senza riga eliminati; errori registrati | §8 | fatto | `apps/server/src/image-gc.test.ts` |
| Un errore transitorio nel caricamento di una mappa o di un volto non è permanente | §10 | fatto | `apps/client/src/table/texture-cache.test.ts` |
| Righello in metri sulla mappa | §10 | da fare | — |

## Ondata 4 — Editor di scena e visione

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Muri, porte, luci, nebbia di guerra | §10 | da fare | — |
| Visione, luce e linea d'effetto calcolate dal server | §8 | da fare | — |

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

## Ondata 5b — Mondi e sessioni (seconda parte, dopo la 2)

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Iscrizioni a una sessione con un personaggio | §10 | da fare | — |
| Chiusura di scena con XP e loot | §7 | da fare | — |

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
