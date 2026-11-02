# Phoenix VTT: guida per lo sviluppo

Questo file è la fonte di verità per chi scrive codice su Phoenix VTT (Claude Code, Codex o una persona). Leggilo per intero prima di toccare il progetto. Quando una regola di gioco o una scelta di prodotto non è descritta qui, **non inventarla**: se è una meccanica vale l'SRD 5.1, altrimenti chiedi all'autore.

## 1. Cos'è Phoenix VTT

Un tavolo virtuale (VTT) web, ospitato su Railway, per il gruppo di gioco dell'autore. Non è un'app pubblica. L'idea è quella di un MMO a realm: ogni giocatore ha un account (username e password), crea personaggi legati a **un solo mondo**, e li vive nelle sessioni pubblicate dal Dungeon Master (DM). C'è **un solo DM per mondo**.

Il tavolo di gioco ha la semplicità di Owlbear Rodeo (mappa, token, dadi, chat), la profondità di Foundry (schede, regole automatizzate) e l'impostazione da MMO (account, personaggi persistenti, mondi, bacheca di sessioni).

Interfaccia e contenuti sono **in italiano**. Distanze in **metri**, pesi in **chilogrammi**.

## 2. Principi non negoziabili

1. **Il server ha l'autorità.** Il client invia comandi, il server li valida, li applica, li salva e trasmette eventi. Il client non tira mai i dadi e non decide mai l'esito di una regola.
2. **Il motore è puro.** `rules-core` e `rules-srd` non importano rete, database, file system, orologio o numeri casuali globali. Tutto ciò che serve entra dal contesto (vedi sezione 5).
3. **Le regole sono codice TypeScript, non dati.** Ogni regola, incantesimo, privilegio, oggetto o mostro è un modulo con il suo test. Non si inventano formati dichiarativi né linguaggi di scripting.
4. **Ogni passo automatico è ispezionabile e correggibile dal DM.** Ogni risultato produce una riga di log leggibile che spiega il perché ("Attacco 17 contro CA 16, colpito. Danno 8 tagliente, resistenza dimezza: 4"). Il DM può correggere o forzare qualunque passo.
5. **Il tavolo non dipende dalle regole.** Un token ha dati propri (posizione, immagine, nome, taglia) e un riferimento *opzionale* a un personaggio o a un attore. Mai il contrario.
6. **Lo storico è la fonte di verità della progressione.** La scheda attuale è il risultato dei cambiamenti registrati nello storico (autore, sessione, scena, campo, prima, dopo). Nessun campo del mondo si modifica senza lasciare una riga di storico.
7. **Nessuna informazione nascosta al client.** Se un giocatore non può vedere qualcosa (nebbia di guerra, token nascosti, sussurri, note del DM), il server non glielo invia. Non basta nasconderlo nell'interfaccia.
8. **Ogni elemento dichiara il suo livello di automazione:** `full`, `partial` o `manual`. Quello che non si automatizza resta come testo e lo risolve il DM.

## 3. Stack e struttura del monorepo

Tecnologie (scelte di partenza, non cambiarle senza accordo):

| Livello | Scelta |
| --- | --- |
| Linguaggio | TypeScript in modalità `strict`, ovunque |
| Gestione pacchetti | pnpm workspaces |
| Test | Vitest (unit e integrazione); Playwright per i test end-to-end, più avanti |
| Client | React + Vite; PixiJS per mappa e token |
| Server | Node + Fastify; WebSocket tramite `@fastify/websocket` |
| Validazione | Zod, con gli schemi di comandi ed eventi condivisi tra client e server |
| Database | PostgreSQL; schede e geometria in colonne JSONB; migrazioni SQL versionate (Drizzle ORM) |
| Password | argon2; sessione con cookie `httpOnly`, `secure`, `sameSite=lax` |
| Hosting | Railway: un servizio per l'app, un PostgreSQL gestito, un volume persistente per le immagini (o archivio compatibile S3) |

```
phoenix-vtt/
  AGENTS.md              questo file
  CLAUDE.md              rimanda a AGENTS.md
  packages/
    rules-core/          motore: eventi, effetti, richieste di decisione, log. Nessuna regola specifica
    rules-srd/           meccaniche SRD 5.1 scritte sul motore (+ modifiche dell'autore)
    content/             classi, razze, talenti, incantesimi, oggetti, mostri (scritti dall'autore)
    shared/              tipi, schemi Zod di comandi/eventi, costanti di conversione, i18n
  apps/
    server/              API REST, WebSocket, persistenza, permessi
    client/              interfaccia React + mappa PixiJS
  docs/
    COVERAGE.md          tabella di copertura dei contenuti (generata)
    SRD-ATTRIBUTION.md   testo di attribuzione dell'SRD 5.1
```

**Regola sulle dipendenze (da far rispettare con un lint, es. `eslint-plugin-boundaries`):**

```
rules-core  ->  (nessuno)
rules-srd   ->  rules-core, shared
content     ->  rules-core, rules-srd, shared
server      ->  tutti i pacchetti
client      ->  rules-core, rules-srd, content, shared   (solo lettura e anteprima)
```

Comandi (da creare nell'ondata 1): `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm coverage:content` (rigenera `docs/COVERAGE.md`).

## 4. Convenzioni

- **Codice in inglese** (identificatori, tipi, commenti brevi, messaggi di commit). **Testi per l'utente in italiano**, mai scritti nel codice: stanno in un catalogo (`packages/shared/i18n/it.ts`) e si leggono tramite chiavi. Così il codice resta pulito e i testi si correggono in un punto solo.
- **ID dei contenuti** in inglese, kebab-case (`shield`, `longsword`), con il **nome italiano** come campo di visualizzazione.
- **Stato come dati serializzabili.** Nessuna classe con stato nascosto nel motore: lo stato di una scena o di uno scontro deve poter essere salvato e ripreso dopo un riavvio.
- **Funzioni piccole, test accanto al codice** (`*.test.ts`). Un'unica responsabilità per modulo.
- **Mai `any`** né `as` per aggirare i tipi, tranne al confine con librerie esterne.
- **Commit piccoli**, uno per cambiamento logico. Messaggio nella forma `area: cosa cambia` (es. `rules-srd: add advantage and disadvantage`).

### Glossario italiano / inglese

| Italiano | Nel codice |
| --- | --- |
| Master / DM | `dm` |
| Giocatore | `player` |
| Mondo | `world` |
| Sessione | `session` |
| Scena | `scene` |
| Personaggio | `character` |
| Attore (PNG, mostro, compagno) | `actor` |
| Scheda | `sheet` |
| Punti ferita (PF) | `hp` |
| Classe armatura (CA) | `ac` |
| Tiro salvezza | `save` |
| Prova di caratteristica / abilità | `check` |
| Successo / fallimento critico | `critical success` / `critical failure` |
| Slot incantesimo | `spellSlot` |
| Concentrazione | `concentration` |
| Condizione | `condition` |
| Riposo breve / lungo | `shortRest` / `longRest` |
| Storico delle modifiche | `changeLog` |
| Diario personale / dell'avventura | `personalDiary` / `adventureJournal` |

## 5. Il motore (`rules-core`)

Il motore non conosce nessuna regola specifica: le impara da `rules-srd` e da `content`. Le firme qui sotto sono indicative: il design esatto si fissa nell'ondata 1, con i test, ma i concetti sono questi.

**Eventi con ganci.** Ogni azione produce eventi nominati (`attack.declared`, `attack.hit`, `damage.applied`, `turn.start`, `rest.long`, `level.up`...). Ogni regola, privilegio, condizione o incantesimo registra ganci sugli eventi che gli interessano, con una priorità. Un gancio può modificare l'evento, aggiungere effetti, produrre altri eventi o fermare la risoluzione per chiedere una decisione.

**Pila di effetti attivi.** Ogni creatura ha una pila di effetti, ciascuno con origine, durata, condizione di fine e modificatori. Condizioni, concentrazione e incantesimi persistenti vivono qui. Regola SRD: lo stesso effetto (stessa fonte) non si cumula, vale il più potente; gli effetti simultanei li ordina chi li controlla.

**Richieste di decisione.** Il motore non si blocca in attesa: restituisce `{ status: "awaiting", request }` e riprende con `resume(requestId, answer)`. Una richiesta è serializzabile, ha un destinatario (un giocatore o il DM), le opzioni, una scadenza facoltativa e una risposta predefinita se scade. Si usa per reazioni (Scudo, Contromagia), scelta dei bersagli, scelte di avanzamento di livello, preparazione incantesimi.

```ts
type DecisionRequest = {
  id: string;
  to: { kind: "actor"; actorId: string } | { kind: "dm" };
  promptKey: string;            // chiave i18n, mai testo italiano nel codice
  options: { id: string; labelKey: string }[];
  timeoutMs?: number;
  defaultOptionId: string;
};

type StepResult =
  | { status: "done"; events: GameEvent[]; log: LogLine[] }
  | { status: "awaiting"; request: DecisionRequest; resumeToken: string };
```

**Casualità.** Il motore riceve un generatore (`Rng`) dal contesto; non usa `Math.random`. Ogni tiro produce un oggetto `RollResult` con dadi, modificatori, totale, vantaggio/svantaggio e flag critico, e finisce nel log. In test si inietta un `Rng` deterministico. In produzione solo il server fornisce l'`Rng` e registra il tiro.

**Geometria.** Il motore legge la scena tramite un'interfaccia, non conosce PixiJS:

```ts
interface SceneGeometry {
  position(actorId: string): GridPoint;
  distanceMeters(a: GridPoint, b: GridPoint): number;
  hasLineOfEffect(from: GridPoint, to: GridPoint): boolean;
  lightLevelAt(p: GridPoint): "bright" | "dim" | "dark";
  creaturesInArea(shape: AreaShape): string[];   // cono, cubo, cilindro, linea, sfera
}
```

I test del motore usano una scena finta in memoria. La vera implementazione sta in `rules-srd`/`server` e legge muri, porte e luci dell'editor di scena.

**Override del DM.** Ogni risoluzione è una sequenza di passi con una riga di log ciascuno. Il DM può annullare un passo, correggere un valore o forzare un esito; la correzione è registrata come evento `dm.override` e, se tocca la scheda, nello storico.

## 6. Contenuti (`content`)

Classi, razze, talenti, incantesimi, oggetti e mostri li **scrive e fornisce l'autore, un pezzo alla volta**, di solito come testo. Il tuo compito è tradurli in moduli TypeScript.

Regole per ogni elemento:

1. Un modulo per elemento, con il suo file di test (`shield.ts` + `shield.test.ts`).
2. Campo `automation`: `"full" | "partial" | "manual"`. Se `partial` o `manual`, spiegare in un commento cosa risolve il DM.
3. Campo `source`: `"srd"`, `"srd-modified"` o `"original"`, per sapere cosa richiede l'attribuzione.
4. Il test copre almeno lo scenario tipico e un caso limite (esempio: Palla di Fuoco su tre bersagli con tiro salvezza su Destrezza).
5. Aggiornare `docs/COVERAGE.md` con `pnpm coverage:content`.
6. **Non copiare testi di manuali di terzi.** Descrizioni e nomi vengono dall'autore.

```ts
export const shield = spell({
  id: "shield",
  nameKey: "spells.shield.name",        // il nome italiano sta nel catalogo i18n
  level: 1,
  school: "abjuration",
  source: "original",
  automation: "full",
  components: { verbal: true, somatic: true },
  reaction: { trigger: "attack.hit", promptKey: "spells.shield.prompt" },
  on: (ctx) => ctx.addEffect({ acBonus: 5, until: "turn.start" }),
});
```

**Componenti materiali.** Senza costo: soddisfatte da una borsa dei componenti o da un focus, senza tracciare l'oggetto. Con costo: il sistema controlla l'inventario (oggetto e valore minimo) prima del lancio, e lo consuma se l'incantesimo lo prevede, registrandolo nello storico. Il DM può sempre concederle a mano. Le mani libere restano a mano del DM. Un incantesimo dichiara: `material: { description, costGp?, consumed? }`.

Un contenuto non ancora fornito dall'autore non si inventa: se serve un esempio per un test, si usa un elemento di prova marcato `// TEST FIXTURE` e fuori da `content/`.

## 7. Meccaniche: SRD 5.1 con queste differenze

**Regola generale: per tutto ciò che non è elencato qui vale l'SRD 5.1 (2014).** Nel codice scrivi le regole con parole tue, non incollare il testo dell'SRD.

| Area | Cosa vale |
| --- | --- |
| Caratteristiche, vantaggio e svantaggio, azioni, iniziativa, attacchi e danni, condizioni, riposi, magia, spazio e taglie | Come SRD |
| Morte | Come SRD (tiri salvezza contro morte, 3 successi o 3 fallimenti), ma **un 1 naturale al tiro salvezza contro morte uccide direttamente** |
| 20 e 1 naturali | **20 naturale = successo critico, 1 naturale = fallimento critico su qualsiasi tiro d20** (prove, tiri salvezza, attacchi): successo e fallimento automatici, con segnalazione al DM. I tiri salvezza contro morte seguono la propria regola. **L'iniziativa è esclusa**: un 20 o un 1 naturale non ha alcun effetto critico e conta solo il totale |
| Colpo critico | Un attacco con **20 naturale** è un colpo critico: raddoppia il **numero di dadi** di danno **e anche i bonus ai danni** (modificatori e bonus fissi). Le resistenze e le vulnerabilità si applicano dopo il raddoppio |
| Parità di iniziativa | Come SRD: i **giocatori** ordinano i propri personaggi in parità tra loro; il **DM** decide ogni parità che coinvolge una sua creatura. Il sistema segnala la parità e non la risolve da solo |
| Ingresso a combattimento in corso | Chi entra **tira l'iniziativa** e si inserisce per totale, **dopo** chi ha lo stesso totale, e **agisce nel round corrente**. Se il suo totale è **superiore** a quello di chi è di turno, gioca **subito** e chi era di turno **riprende** il suo turno dopo di lui (senza ripetere l'inizio del turno: evento `turn.resume`, non `turn.start`). Se il totale è uguale o inferiore, agisce al suo posto nell'ordine. Nessuno già passato in questo round rigioca |
| Copertura | La assegna il DM a mano (parziale o totale, con i bonus alla CA); non si calcola dalla mappa |
| Luce e visione | Automatiche, calcolate da muri, porte e luci dell'editor di scena (ondata dedicata) |
| Veleni, malattie, trappole | Automatici: il motore applica danni e condizioni quando scattano; il DM può correggere |
| Ambiente (cadute, soffocamento, fame e sete, temperature estreme) | A mano del DM, con una **scheda di riferimento rapida** nell'interfaccia (danni e condizioni applicabili con pochi clic) |
| Viaggio ed esplorazione | A mano del DM, con una scheda di riferimento rapida |
| Peso | **Solo carico massimo**, legato alla Forza. Nessuna variante di ingombro. Pesi in **kg** |
| Monete | 5 monete come SRD (cambio 1:10) |
| Creazione dei punteggi | Tre metodi: serie standard, acquisto a punti, 4d6 scartando il più basso. Il tiro lo esegue il server e lo registra |
| PF per livello | Livello 1: massimo del Dado Vita + mod. COS. Livelli successivi: il giocatore sceglie tra tiro e media fissa (arrotondata per eccesso); il tiro lo esegue il server e lo registra |
| Arrotondamento dei PF massimi | Qualunque calcolo che modifica i PF massimi (per esempio il livello 4 di Indebolimento, che li dimezza) si arrotonda **sempre per difetto**, in qualsiasi contesto |
| Aumenti e talenti | Ai livelli 4, 8, 12, 16 e 19 si sceglie tra aumento dei punteggi e talento |
| Multiclasse | Come SRD. Il modello della scheda la prevede dal giorno uno, ma si implementa dopo il caso a classe singola |
| Sintonia e ispirazione | Come SRD (massimo 3 oggetti sintonizzati; ispirazione assegnata dal DM) |
| Grado di sfida e XP dei mostri | Come SRD, con un calcolatore di difficoltà per il DM; gli XP vengono suggeriti a fine scena e li conferma il DM |
| Azioni leggendarie e tane | Come SRD |
| Componenti materiali | Vedi sezione 6 |

### Unità di misura

Tutte le costanti di conversione stanno in **un solo file** (`packages/shared/units.ts`), così si correggono in un punto. Valori **confermati dall'autore**:

| Grandezza | SRD | Phoenix |
| --- | --- | --- |
| Distanza | 5 piedi (una casella) | **1,5 m** |
| Velocità, gittate, aree | 30 ft, 60 ft, 15 ft... | 9 m, 18 m, 4,5 m... (1 ft = 0,3 m) |
| Peso | 1 libbra | **0,5 kg** |
| Peso di una moneta | 50 monete = 1 libbra | **1 moneta = 10 g** |
| Carico massimo | FOR × 15 libbre | **FOR × 7,5 kg** |
| Sollevare, spingere, trascinare | FOR × 30 libbre | **FOR × 15 kg** |
| Caduta | 1d6 ogni 10 ft | 1d6 ogni **3 m** (massimo 20d6) |

La mappa usa una griglia con caselle da 1,5 m. Il codice interno ragiona in **metri** (numeri decimali) o in **caselle**, mai in piedi.

### Avanzamento di livello

- XP assegnati dal DM **alla fine di ogni scena**. Una sessione contiene più scene; la nota di cronaca si scrive a fine sessione.
- Il livello **sale in automatico** quando gli XP raggiungono la soglia. Le soglie e ciò che ogni livello concede arrivano con le classi (non inventarle: fino ad allora si usano valori di prova nei test).
- Il sistema applica da solo tutto ciò che il livello concede (nuove abilità, incantesimi, PF). Dove c'è una **scelta** (incantesimo, talento o aumento, tiro o media dei PF) la crea come richiesta in sospeso sul personaggio.
- Un avanzamento con scelte in sospeso è indicato **appena il giocatore apre la lista dei personaggi**, con tutto ciò che richiede, e lo completa in un percorso guidato (anche fuori sessione). Finché le scelte sono in sospeso il personaggio può giocare con i benefici già applicati; i dettagli si decidono nell'ondata 2.

### Riposi e incantesimi preparati

Quando il DM dichiara un riposo lungo durante la sessione, il sistema applica i recuperi (PF, Dadi Vita, slot) e **chiede a ogni giocatore** con incantesimi preparati se vuole cambiare la lista, nel rispetto delle regole SRD (numero massimo e incantesimi disponibili per la classe).

## 8. Server

- **Comandi e eventi.** Il client invia comandi tipizzati (`token.move`, `roll.request`, `decision.answer`...). Il server li valida (schema Zod e permessi), li applica al motore, salva ciò che serve e trasmette eventi a tutti i client della stanza, filtrati per visibilità.
- **Stato live in memoria** per la scena attiva e gli scontri in corso, scritto su database a intervalli e a ogni evento importante. Un client che si riconnette riceve lo stato corrente. Poiché lo stato live è in memoria, il servizio gira in **una sola istanza**.
- **REST** per account, mondi, personaggi, schede, bacheca, diari, upload. **WebSocket** per il tavolo live.
- **Dadi.** Solo il server tira. Ogni tiro è registrato nel log di sessione con dadi, modificatori e totale.
- **Visibilità.** Per ogni client il server calcola cosa vede (nebbia di guerra, luce, token nascosti, sussurri) e invia solo quello.
- **Upload.** Immagini di mappe e token dietro un livello di astrazione (volume locale oggi, archivio S3 domani), con limite di dimensione e controllo del tipo di file.

### Permessi

| Azione | Giocatore | DM |
| --- | --- | --- |
| Creare un personaggio nel mondo in cui è iscritto | Sì | Sì |
| Modificare la scheda fuori sessione | **No** (solo avanzamenti in sospeso e preparazione incantesimi al riposo) | Sì, con storico |
| Scrivere nel proprio diario personale | Sì (solo il proprio) | No |
| Scrivere nel diario dell'avventura del party | Sì | Sì |
| Modificare livello, XP, oggetti, oro, risorse | No | Sì, con storico |
| Muovere i token | Solo i propri | Tutti |
| Vedere token nascosti, note e geometria della scena | No | Sì |
| Creare mondi, sessioni e scene | No | Sì |
| Correggere o forzare un passo automatico | No | Sì |

## 9. Modello dati

```
Account
 └─ WorldMembership (ruolo: dm | player) ── World
                                              ├─ Actor (PNG, mostri, compagni)
                                              ├─ Scene (libreria del mondo)
                                              └─ Session ── SessionSignup ── Character
                                                    ├─ ChatMessage / Roll
                                                    ├─ SceneRun (scena giocata, in sequenza)
                                                    │    └─ SceneReport (XP, loot)
                                                    └─ SessionReport (nota di cronaca)
Character (account + mondo)
 ├─ sheet (campi del giocatore + campi del mondo)
 ├─ pendingLevelUp (scelte in sospeso)
 ├─ ChangeLog (autore, sessione, scena, campo, prima, dopo)
 └─ PersonalDiary
Scene ── Token (posizione, immagine, riferimento opzionale a Character o Actor)
Scene ── MapGeometry (immagine, muri, porte, luci, nebbia di guerra)
Party ── AdventureJournal (diario dell'avventura, condiviso col party)
```

- L'appartenenza al mondo è una tabella con ruolo, **non** un campo `dm_id`. Oggi ammette un solo DM; passare a più DM sarà una modifica di regola, non di schema.
- La scheda ha **campi del giocatore** (aspetto e storia alla creazione, scelte di livello) e **campi del mondo** (livello, XP, oggetti, oro, risorse). Questi ultimi li modifica solo il DM o il sistema, sempre con una riga di storico.
- Il modello prevede fin dall'inizio le **creature legate a un personaggio** (compagni, evocazioni, seguaci) e il **multiclasse** (più livelli di classe per personaggio, slot combinati).

## 10. Client

Pagine: accesso e registrazione; **lista dei personaggi** (stile selezione di World of Warcraft, con l'indicazione dell'avanzamento di livello in sospeso); creazione guidata; scheda in sola lettura (con le scelte consentite); diario personale e diario dell'avventura; pannello del mondo; bacheca delle sessioni (il DM pubblica titolo, data, livello consigliato, posti; i giocatori si iscrivono con un personaggio, il DM conferma; stati: bozza, pubblicata, in corso, chiusa); **tavolo live**; editor di scena per il DM.

Il tavolo live: la mappa occupa quasi tutto lo schermo, il resto è a scomparsa; strumenti pochi e sempre visibili; pan e zoom fluidi; griglia da 1,5 m; token con aggancio; righello in metri; dadi e chat con notazione standard, tiri riservati e sussurri, log di sessione persistente. Per il movimento dei token il client applica subito la modifica in locale e la riconcilia con il server.

**Editor di scena (DM):** carica l'immagine della mappa e costruisce sopra muri, porte (aperte/chiuse), punti luce (raggio, intensità) e nebbia di guerra. Da questi dati il server calcola visione, luce e linea d'effetto per ogni giocatore.

## 11. Hosting su Railway

**La pubblicazione su Railway è l'ultimo passo del progetto**, dopo l'ondata 7 o quando l'autore dichiara il progetto pronto. Fino ad allora tutto gira in locale con Docker (`docker compose`: PostgreSQL, server, client con proxy). Un solo `Dockerfile` multi-stage con target `dev` e `prod`; client e server restano pacchetti separati ma si distribuiscono come un unico servizio.

- Un servizio per l'app (`apps/server` serve anche i file statici del client), un database PostgreSQL gestito, un volume persistente per le immagini.
- Configurazione solo da variabili d'ambiente (`DATABASE_URL`, `SESSION_SECRET`, `STORAGE_PATH`...). Nessun segreto nel repository.
- Migrazioni applicate all'avvio o come passo di rilascio; mai modificare a mano lo schema di produzione.
- Endpoint di salute (`/health`). Log strutturati in JSON.
- Una sola istanza (lo stato live è in memoria). Verificare su Railway costi e limiti del piano scelto.

## 12. Attribuzione dell'SRD 5.1 (obbligatoria)

Il prodotto usa meccaniche dell'SRD 5.1, rilasciato con licenza Creative Commons CC-BY-4.0. Una pagina di crediti raggiungibile dall'interfaccia (e `docs/SRD-ATTRIBUTION.md`) deve contenere:

> This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

Non è una consulenza legale. Non copiare testi di altri manuali (Manuale del Giocatore, Xanathar, Tasha o simili): i contenuti li scrive l'autore.

## 13. Ondate di sviluppo

Si consegna per ondate, ciascuna realmente usabile. Non iniziare l'ondata N+1 prima che l'ondata N abbia i test verdi.

1. **Fondamenta.** Monorepo, tooling, lint sulle dipendenze, motore (`rules-core`) con eventi, pila di effetti, richieste di decisione, log; `rules-srd` con d20, vantaggio e svantaggio, caratteristiche e abilità, iniziativa, attacchi e danni, condizioni, morte, riposi; una classe di prova nei test; account con username e password.
2. **Personaggi.** Creazione guidata (tre metodi per i punteggi), scheda, storico delle modifiche, diari, avanzamento di livello con scelte in sospeso.
3. **Tavolo minimo.** Scena, griglia, token, dadi e chat in tempo reale, con riconnessione. Da qui si gioca una sessione di prova.
4. **Editor di scena e visione.** Muri, porte, luci, nebbia di guerra, calcolo di visione e linea d'effetto lato server.
5. **Mondi e sessioni.** Inviti, bacheca, iscrizioni, chiusura di scena (XP e loot) e di sessione (cronaca).
6. **Automazione del combattimento.** Iniziativa, attacchi, reazioni, concentrazione, magia con aree, componenti, trappole, con override del DM e log leggibile.
7. **Contenuti.** Classi, razze, talenti, incantesimi, oggetti, mostri forniti dall'autore man mano, con copertura che cresce.

**Ultimo passo, dopo l'ondata 7: pubblicazione su Railway** (vedi sezione 11).

### Automazione delle condizioni: cosa arriva in quale ondata

Le regole delle condizioni sono funzioni di consultazione in `rules-srd`. Il collegamento automatico arriva con le parti da cui dipendono:

- **Ondata 1 (fatto):** modello sulla pila degli effetti, consultazioni (vantaggio e svantaggio, fallimenti automatici, velocità, difese), etichette sulle prove (vista, udito, sociale), immunità alle condizioni, costo di movimento (strisciare, alzarsi), fine della presa, divieto di avvicinarsi del Spaventato.
- **Ondata 4 (visione):** il controllo "vede la fonte" dello Spaventato e la portata di 1,5 m si ricavano dalla scena.
- **Ondata 6 (combattimento):** i ganci applicano le consultazioni su attacco, prova, salvezza e movimento; salvezze ripetute a fine turno; conseguenze a cascata (perdita di concentrazione se incapacitato, oggetti lasciati cadere da chi è privo di sensi, Indebolimento 6).
- **Ondata 2 (scheda) e riposi:** l'Indebolimento riduce i PF massimi sulla scheda con riga di storico (sempre arrotondati per difetto) e il riposo lungo ne toglie un livello.
- **Resta sempre al DM:** la narrazione dell'udito, i comportamenti dell'Affascinato oltre gli attacchi, l'inconsapevolezza del Pietrificato.

Fuori dalle prime ondate: mappa del mondo, voce e video, più DM per mondo, downtime.

**Definizione di "fatto" per ogni cambiamento:** i test passano, `pnpm typecheck` e `pnpm lint` sono puliti, i testi per l'utente sono nel catalogo italiano, e nessuna informazione riservata arriva a chi non deve vederla.

## 14. Come lavorare su questo progetto

- Parti sempre da un test che descrive la regola, poi scrivi il codice.
- Cambiamenti piccoli e verificabili. Se un compito è grande, spezzalo e dichiara come.
- Se una regola non è in questo file, vale l'SRD 5.1; se nemmeno l'SRD basta o hai un dubbio di prodotto, **fermati e chiedi all'autore**, indicando le opzioni.
- Non cambiare di tua iniziativa una scelta di questo documento. Se pensi che sia sbagliata, proponi la modifica e spiega perché.
- Dopo ogni regola o contenuto nuovo, aggiorna `docs/COVERAGE.md`.
- Questo file va aggiornato quando una decisione cambia: è la fonte di verità, non il codice.

## 15. Questioni ancora aperte

- Dettaglio del flusso "scelte di avanzamento in sospeso" (cosa può fare il personaggio finché non le completa).
- Soglie di XP, classi, razze, talenti, incantesimi, oggetti, mostri: arrivano dall'autore.
