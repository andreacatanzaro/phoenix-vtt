# Requisiti, ondate e test

Ogni requisito di AGENTS.md con l'ondata in cui si consegna, lo stato e i test che lo verificano. Un test del repository (`scripts/requisiti.test.ts`) controlla che ogni file di test citato esista. Le ondate sono nell'ordine di consegna di AGENTS.md (sezione 13): 1, 5a, 3, 3b, 4a, 2, 5b, 4b, 6, 7. Stato: **fatto**, **parziale** (una parte è consegnata, il resto è nell'ondata indicata), **da fare**.

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
| Immagine della mappa di una scena: caricamento con limite di dimensione e controllo del tipo | §8 | fatto | `apps/server/src/images.test.ts`, `apps/server/src/image-info.test.ts`, `apps/server/src/image-store.test.ts`, `apps/client/src/SceneControls.test.tsx` |
| Scena giocata con griglia (un quadretto = 1,5 m); pan e zoom | §10 | fatto | `apps/client/src/table/geometry.test.ts`, `apps/client/src/Board.test.tsx` |
| Token con aggancio alla griglia; solo i propri per il giocatore, tutti per il DM | §8, §10 | fatto | `apps/server/src/table.test.ts`, `apps/client/src/TokenPanel.test.tsx`, `apps/client/src/table/geometry.test.ts` |
| Token nascosti: li vede solo il DM | §8 | fatto | `apps/server/src/table.test.ts`, `apps/server/src/table/visibility.test.ts` |
| Filtro di visibilità nel protocollo: il server invia a ogni client solo ciò che può vedere | §8 | fatto | `apps/server/src/table/visibility.test.ts`, `apps/server/src/table.test.ts` |
| Dadi con notazione standard tirati dal server, tiri riservati e sussurri, log persistente | §8, §10 | fatto | `apps/server/src/table.test.ts`, `apps/server/src/table/crypto-rng.test.ts`, `apps/client/src/ChatPanel.test.tsx` |
| Chat in tempo reale | §10 | fatto | `apps/server/src/table.test.ts`, `apps/client/src/ChatPanel.test.tsx`, `apps/client/src/TablePage.test.tsx` |
| Riconnessione con stato corrente | §8 | fatto | `apps/server/src/table.test.ts`, `apps/client/src/table/connection.test.ts`, `apps/client/src/TablePage.test.tsx` |
| Spostamento di tutti da una scena all'altra (personaggi e PNG del party, zona di partenza) | §9 | fatto | `apps/server/src/table.test.ts`, `packages/shared/src/placement.test.ts`, `apps/client/src/ScenesPanel.test.tsx` |
| Chi esce dal mondo esce subito dal tavolo | §8 | fatto | `apps/server/src/table.test.ts` |
| Una scena con token si elimina solo con la conferma esplicita del DM (i token vanno con lei); la scena in gioco non si elimina mai; i comandi del tavolo e la chiusura della sessione sono eseguiti uno alla volta | §8, §9 | fatto | `apps/server/src/table.test.ts`, `apps/server/src/table/serial-queue.test.ts`, `apps/client/src/WorldPage.test.tsx` |
| Le immagini non più usate si eliminano (riga e file) dopo un'ora di tolleranza | §8 | fatto | `apps/server/src/image-gc.test.ts` |
| Un giocatore scarica solo le immagini che vede ora (mappa della scena in gioco, volti dei token non nascosti) | §8 | fatto | `apps/server/src/images.test.ts` |
| La cronologia in riconnessione conta solo le righe che il lettore può vedere | §8, §10 | fatto | `apps/server/src/table.test.ts` |
| Il socket del tavolo non sopravvive al logout né alla scadenza del login; i frame in eccesso sono scartati prima di accodarli | §8 | fatto | `apps/server/src/table.test.ts`, `apps/server/src/table/frame-gate.test.ts` |
| Pulizia delle immagini senza perdite: prima la riga, poi il file; file senza riga eliminati; errori registrati | §8 | fatto | `apps/server/src/image-gc.test.ts` |
| Un errore transitorio nel caricamento di una mappa o di un volto non è permanente | §10 | fatto | `apps/client/src/table/texture-cache.test.ts` |
| Tavolo a schermo intero come Owlbear Rodeo: la mappa riempie la finestra e tutto il resto galleggia sopra (menu in alto a sinistra, opzioni in alto al centro, strumenti a destra, barra "aggiungi" e scala in basso) | §10 | fatto | `apps/client/src/TablePage.test.tsx`, `apps/client/src/ToolColumn.test.tsx`, `apps/client/src/ToolOptions.test.tsx`, `apps/client/src/Board.test.tsx` |
| Strumenti Sposta (W), Seleziona (S, a rettangolo e a mano libera), Misura (M, righello e raggio, in metri), Puntatore (Q), Testo (T, solo DM) | §10 | fatto | `apps/client/src/table/tools.test.ts`, `apps/client/src/table/selection.test.ts`, `apps/client/src/table/measure.test.ts`, `apps/client/src/table/geometry.test.ts` |
| Selezione multipla, trascinamento di gruppo e barra della selezione (mostra/nascondi, duplica, elimina, altro) | §10 | fatto | `apps/client/src/SelectionBar.test.tsx`, `apps/client/src/TablePage.test.tsx` |
| Puntatore condiviso (con il nome, mai salvato) e testi scritti sulla mappa | §10 | fatto | `apps/server/src/table.test.ts`, `apps/client/src/table/pointers.test.ts`, `apps/client/src/TokenPanel.test.tsx` |
| Controlli della scena: griglia, mappa, zona di partenza, vista (posizione, zoom, ripristina) e "porta tutti alla mia vista" | §10 | fatto | `apps/client/src/SceneControls.test.tsx`, `apps/server/src/table.test.ts` |
| La mappa si usa anche da tastiera: Tab, frecce per la vista, più e meno per lo zoom; elenco dei token per selezionare, muovere e scrivere testi | §10 | parziale (righello e puntatore no) | `apps/client/src/Board.test.tsx`, `apps/client/src/TokenPanel.test.tsx` |
| Maiusc con rettangolo e mano libera aggiunge e toglie; ridimensionare la finestra conserva vista e zoom; il duplicato resta sulla mappa | §10 | fatto | `apps/client/src/table/selection.test.ts`, `apps/client/src/table/geometry.test.ts`, `apps/client/src/SelectionBar.test.tsx` |
| Puntatore: login riverificato, limite per persona, al massimo 4 connessioni per persona | §8 | fatto | `apps/server/src/table.test.ts` |
| Disegno e nebbia di guerra (strumenti Draw e Fog), annulla e ripeti | §10 | da fare | — |

## Ondata 3b — Atlante e preparazione (da consegnare in quest'ordine: allineamento, preparazione, atlante, libreria di token)

Requisiti aggiunti dall'autore dopo l'ondata 3. Nessuno è ancora fatto: il test che lo verificherà si indica quando arriva.

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Allineamento della mappa alla griglia in tre passi come Owlbear Rodeo: Offset (àncora trascinata sul punto che deve coincidere con un incrocio, con lente d'ingrandimento), Size (quadrato trascinato fino a coprire una casella) e Refine (griglia calcolata sovrapposta, incroci spostabili) | §10 | fatto | `apps/client/src/table/align.test.ts`, `apps/client/src/AlignBar.test.tsx`, `apps/client/src/TablePage.test.tsx` |
| Dall'allineamento si ricavano la dimensione del quadretto e lo spostamento della griglia; l'inserimento a numeri resta sempre possibile; anteprima della griglia attivabile | §10 | fatto | `apps/client/src/SceneControls.test.tsx`, `apps/server/src/images.test.ts` |
| La scena si prepara prima della sessione, senza sessione in corso, nella schermata del tavolo in modalità preparazione (senza chat né giocatori, solo DM) | §10 | fatto | `apps/server/src/prepare.test.ts`, `apps/client/src/TablePage.test.tsx`, `apps/client/src/WorldPagePrepare.test.tsx` |
| In preparazione il DM carica e cambia la mappa, imposta la griglia, disegna la zona di partenza dei giocatori sulla mappa, aggiunge, sposta, nasconde e rimuove token e testi | §10 | fatto | `apps/server/src/prepare.test.ts`, `apps/client/src/TablePage.test.tsx`, `apps/client/src/table/geometry.test.ts` |
| Un solo stato della scena: ciò che si prepara è ciò che si trova in sessione, e ciò che si muove in gioco resta | §9 | fatto | `apps/server/src/prepare.test.ts` |
| La scena in gioco non si apre in preparazione; le altre sì, anche con una sessione in corso, senza che i giocatori se ne accorgano | §9, §10 | fatto | `apps/server/src/prepare.test.ts` |
| Regione con una mappa; le aree sono poligoni a punti disegnati sulla mappa della regione | §9, §10 | fatto | `apps/server/src/atlas.test.ts`, `apps/client/src/atlas/ElementMap.test.tsx`, `apps/client/src/atlas/map-geometry.test.ts`, `apps/client/src/atlas/MapCanvas.test.tsx`, `packages/shared/src/atlas.test.ts` |
| I luoghi sono pin dentro un'area, sulla mappa della regione; ogni luogo ha una mappa | §9 | fatto | `apps/server/src/atlas.test.ts`, `apps/client/src/atlas/ElementMap.test.tsx` |
| Le scene sono pin sulla mappa del luogo; la scena giocata (mappa da battaglia, griglia, token) resta come oggi | §9 | fatto | `apps/server/src/atlas.test.ts`, `apps/client/src/atlas/ElementMap.test.tsx` |
| Le mappe non sono obbligatorie: dove c'è una mappa si piazza sulla mappa, dove manca (regione senza mappa, area non disegnata, luogo senza mappa) si crea dal modulo con il nome; i dati esistenti che potrebbero stare su una mappa restano in un elenco transitorio «da piazzare» che il DM piazza o elimina, e che sparisce a conversione finita; i giocatori vedono anche ciò che non ha una mappa su cui stare | §9, §10 | fatto | `apps/client/src/WorldPageAtlas.test.tsx`, `apps/client/src/tree.test.ts` |
| Il pin di una scena apre la scheda con Prepara, Apri al tavolo e Porta tutti qui; le azioni che cambiano il tavolo chiedono conferma | §10 | fatto | `apps/server/src/scene-actions.test.ts`, `apps/client/src/WorldPageActions.test.tsx`, `apps/client/src/WorldPagePrepare.test.tsx` |
| Le uscite tra scene si tracciano come frecce tra i pin sulla mappa del luogo (più uscite per scena); per altri luoghi si sceglie da un elenco | §9, §10 | fatto | `apps/client/src/atlas/ElementMap.test.tsx`, `apps/client/src/atlas/MapCanvas.test.tsx`, `apps/client/src/atlas/map-geometry.test.ts` |
| Navigazione: un clic su un'area o un pin apre la mappa contenuta, con il percorso in alto per tornare indietro | §10 | fatto | `apps/client/src/WorldPageAtlas.test.tsx`, `apps/client/src/atlas/ElementMap.test.tsx`, `apps/client/src/tree.test.ts` |
| Visibilità come oggi (rivelato per elemento, note del DM mai ai giocatori); il server non invia ai giocatori né i pin né le mappe che non vedono; i giocatori navigano in sola lettura | §8, §9 | fatto | `apps/server/src/atlas.test.ts`, `apps/client/src/WorldPageAtlas.test.tsx` |
| Le mappe di regioni e luoghi e i token della libreria seguono la visibilità e la pulizia delle immagini (`image-access`, `reclaimImages`) | §8 | fatto | `apps/server/src/atlas.test.ts`, `apps/server/src/token-library.test.ts` |
| Libreria di token del mondo (nome, immagine, taglia, colore), visibile solo al DM | §9, §10 | fatto | `apps/server/src/token-library.test.ts`, `apps/client/src/LibraryPanel.test.tsx` |
| I token piazzati sono copie indipendenti dalla libreria | §9 | fatto | `apps/server/src/token-library.test.ts` |
| Aggiungere token alle scene dalla libreria, in preparazione e al tavolo | §10 | parziale: si aggiungono con un pulsante; il trascinamento sulla mappa non c'è | `apps/client/src/LibraryPanel.test.tsx`, `apps/client/src/TablePage.test.tsx` |

## Struttura come grafo (richiesta dall'autore dopo l'atlante, parte della 3b)

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| La gestione di Regione, Area, Luogo e Scena è un grafo su un cielo notturno: la Regione è un gruppo che contiene Aree, l'Area un gruppo che contiene Luoghi, il Luogo un gruppo che contiene Scene | §10 | fatto | `apps/client/src/WorldPageAtlas.test.tsx`, `apps/client/src/graph/GraphCanvas.test.tsx` |
| Si entra in un gruppo (pulsante o doppio clic) e il percorso in alto riporta indietro, un livello alla volta | §10 | fatto | `apps/client/src/WorldPageAtlas.test.tsx` |
| Il grafo si muove come una mappa (trascinare il cielo, rotella, pulsanti, mostra tutto, anche per nodi molto lontani) e, quando cambia la larghezza, tiene fermo il nodo scelto (o il centro se non ce n'è) | §10 | fatto | `apps/client/src/graph/GraphCanvas.test.tsx` |
| Il DM trascina i nodi e la posizione si salva per elemento; si possono bloccare; ai giocatori non si muovono | §9, §10 | fatto | `apps/server/src/graph-positions.test.ts`, `apps/client/src/graph/GraphCanvas.test.tsx`, `apps/client/src/WorldPageAtlas.test.tsx` |
| Senza una posizione salvata il layout dà a ogni nodo il suo posto, sempre lo stesso, senza spostare gli altri | §10 | fatto | `apps/client/src/graph/layout.test.ts` |
| Il DM aggiunge un elemento per nome dalla barra («Aggiungi Regione/Area/Luogo/Scena»); dove il gruppo ha una mappa il pulsante diventa «Aggiungi … sulla mappa» e apre i dettagli, e un rifiuto del server resta scritto sullo schermo | §10 | fatto | `apps/client/src/WorldPageAtlas.test.tsx` |
| Le scene di un luogo si collegano con linee: «Collega da scena…» e poi l'altra scena; una linea scelta porta ai dettagli della scena di partenza | §10 | fatto | `apps/client/src/graph/GraphCanvas.test.tsx`, `apps/client/src/WorldPageAtlas.test.tsx` |
| Scegliere un nodo apre a destra i dettagli (note, visibilità, mappe, uscite, preparazione, tavolo) | §10 | fatto | `apps/client/src/WorldPageAtlas.test.tsx`, `apps/client/src/WorldPage.test.tsx` |
| «Trova» elenca ogni elemento col suo percorso e porta lì | §10 | fatto | `apps/client/src/WorldPageAtlas.test.tsx` |
| Un giocatore cammina il grafo in sola lettura e vede ciò che è rivelato (senza ciò che aspetta di essere piazzato) | §8, §10 | fatto | `apps/client/src/WorldPageAtlas.test.tsx` |
| Ciò che potrebbe stare su una mappa che esiste e non è stato piazzato ha il segno «Da piazzare» sul nodo | §10 | fatto | `apps/client/src/WorldPageAtlas.test.tsx`, `apps/client/src/tree.test.ts` |
| L'id della mappa da battaglia di una scena non arriva ai giocatori nell'elenco delle scene | §8 | fatto | `apps/server/src/atlas.test.ts` |

## Ondata 4a — Editor di scena e visione (subito dopo la 3b)

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Muri, porte, luci, nebbia di guerra | §10 | da fare | — |
| Strumenti Draw e Fog del tavolo | §10 | da fare | — |
| Visione, luce e linea d'effetto calcolate dal server | §8 | da fare | — |
| Raggio di visione del token scelto dal DM a mano | §13 | da fare | — |

## Ondata 4b — Visione dai personaggi (dopo la 5b)

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Raggio e tipo di vista del token derivati dai sensi del personaggio, con il valore del DM come correzione | §13 | da fare | — |
| Condizioni legate alla vista (Spaventato «vede la fonte», portata di 1,5 m) e luce sulle prove | §13 | da fare | — |

## Ondata 2 — Personaggi

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Creazione guidata con i tre metodi per i punteggi | §7 | da fare | — |
| PF al livello 1 e per livello (tiro o media) | §7 | parziale: calcolo | `packages/rules-srd/src/class-model.test.ts` |
| Scheda con campi del giocatore e campi del mondo | §9 | da fare | — |
| Storico delle modifiche (fonte di verità della progressione) | §2 | da fare | — |
| Avanzamento di livello con scelte in sospeso | §7 | parziale: modello | `packages/rules-srd/src/class-model.test.ts` |
| Il personaggio con scelte in sospeso non entra in una scena: entra nella scena successiva solo dopo aver scelto; l'attesa vale solo per quel giocatore, la scena parte per gli altri; se è scollegato completa le scelte alla riconnessione, prima di rientrare | §7 | da fare | — |
| Le scelte di avanzamento le completa solo il giocatore; senza scelte il personaggio resta fuori, senza tempo massimo né eccezioni del DM | §7 | da fare | — |
| Più livelli saliti insieme: scelte in coda, un livello per volta, nell'ordine dei livelli | §7 | da fare | — |
| Soglie di XP dell'SRD 5.1 italiano, in un solo modulo con test su ogni livello | §7 | da fare | — |
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
| PF temporanei (`tempHp` sulla creatura): assorbono il danno per primi, non si sommano, riga di log con l'assorbito | §15 | da fare | — |
| Cambio scena: per ogni effetto attivo di chi si sposta il sistema chiede al DM «mantieni o termina» | §9 | da fare | — |

## Ondata 7 — Contenuti

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Classi SRD 5.1 con sottoclassi | §6 | parziale: Guerriero e Campione | `packages/content/src/classes/fighter/fighter.test.ts`, `packages/content/src/classes/fighter/champion.test.ts`, `packages/content/src/classes/fighter/fighter-hooks.test.ts`, `packages/content/src/classes/fighter/fighting-styles.test.ts` |
| Razze, talenti, incantesimi, oggetti, mostri | §6 | da fare | — |

## Dopo l'ondata 7

| Requisito | Rif. | Stato | Test |
| --- | --- | --- | --- |
| Pubblicazione su Railway | §11 | da fare | — |
