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
    REQUISITI.md         requisiti, ondata, stato e test (un test controlla che i file citati esistano)
    SRD-ATTRIBUTION.md   testo di attribuzione dell'SRD 5.1
  Dockerfile             multi-stage: target dev (compose) e prod (un solo servizio)
  docker-compose.yml     sviluppo locale: PostgreSQL, server, client
  .github/workflows/     integrazione continua
```

**Regola sulle dipendenze (da far rispettare con un lint, es. `eslint-plugin-boundaries`):**

```
rules-core  ->  (nessuno)
rules-srd   ->  rules-core, shared
content     ->  rules-core, rules-srd, shared
server      ->  tutti i pacchetti
client      ->  rules-core, rules-srd, content, shared   (solo lettura e anteprima)
```

Comandi: `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm coverage:content` (rigenera `docs/COVERAGE.md`), `pnpm coverage:check` (fallisce se `docs/COVERAGE.md` non è aggiornato; da usare in CI). Il rapporto legge i contenuti da `packages/content/src/registry.ts`: ogni nuova classe va registrata lì.

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
| Regione | `region` |
| Area | `area` |
| Luogo | `place` |
| Sessione di gioco | `gameSession` (la sessione di accesso di un account è `session` e resta interna al server) |
| Scena | `scene` |
| Pin (segnaposto su una mappa dell'atlante) | `pin` |
| Libreria di token | `tokenLibrary` |
| Collegamento tra scene | `sceneLink` |
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

Le classi, i nomi e i testi italiani dell'SRD 5.1 si importano dall'**SRD 5.1 ufficiale in italiano** (CC BY 4.0), con `source: "srd"`. Un contenuto non presente né nell'SRD né fornito dall'autore non si inventa: se serve un esempio per un test, si usa un elemento di prova marcato `// TEST FIXTURE` e fuori da `content/`.

## 7. Meccaniche: SRD 5.1 con queste differenze

**Regola generale: per tutto ciò che non è elencato qui vale l'SRD 5.1 (2014).** Nel codice scrivi le regole con parole tue, non incollare il testo dell'SRD.

| Area | Cosa vale |
| --- | --- |
| Caratteristiche, vantaggio e svantaggio, azioni, iniziativa, attacchi e danni, condizioni, riposi, magia, spazio e taglie | Come SRD |
| Morte | Come SRD (tiri salvezza contro morte, 3 successi o 3 fallimenti), ma **un 1 naturale al tiro salvezza contro morte uccide direttamente**. I **personaggi e i loro compagni** fanno i tiri salvezza contro morte; i **PNG e i mostri non li fanno**: a 0 PF muoiono, salvo che il DM li attivi per una singola creatura. Una creatura **stabile** che subisce danno torna a fare i tiri salvezza contro morte, ripartendo da zero successi e zero fallimenti |
| 20 e 1 naturali | **20 naturale = successo critico, 1 naturale = fallimento critico su qualsiasi tiro d20** (prove, tiri salvezza, attacchi): successo e fallimento automatici, con segnalazione al DM. I tiri salvezza contro morte seguono la propria regola. **L'iniziativa è esclusa**: un 20 o un 1 naturale non ha alcun effetto critico e conta solo il totale |
| Colpo critico | Un attacco con **20 naturale** è un colpo critico: raddoppia il **numero di dadi** di danno **e anche i bonus ai danni** (modificatori e bonus fissi). Le resistenze e le vulnerabilità si applicano dopo il raddoppio |
| Parità di iniziativa | Come SRD: i **giocatori** ordinano i propri personaggi in parità tra loro; il **DM** decide ogni parità che coinvolge una sua creatura. Il sistema segnala la parità e non la risolve da solo |
| Ingresso a combattimento in corso | Chi entra **tira l'iniziativa** e si inserisce per totale, **dopo** chi ha lo stesso totale, e **agisce nel round corrente**. Se il suo totale è **superiore** a quello di chi è di turno, gioca **subito** e chi era di turno **riprende** il suo turno dopo di lui (senza ripetere l'inizio del turno: evento `turn.resume`, non `turn.start`). Se il totale è uguale o inferiore, agisce al suo posto nell'ordine. Nessuno già passato in questo round rigioca |
| Sorpresa | Come SRD: la dichiara il DM. Chi è sorpreso non può muoversi né effettuare un'azione nel primo turno e non può reagire finché quel turno non termina. L'SRD non nomina l'azione bonus, quindi resta disponibile |
| Aiuto | Come SRD. L'aiuto a una prova vale solo per la prova del compito indicato; l'aiuto a un attacco richiede l'aiutante entro 1,5 m dal bersaglio (lo comunica la scena) |
| Sottoclassi | Si scelgono sempre al **3° livello**, per tutte le classi (regola d'autore: nell'SRD alcune classi scelgono prima). I privilegi che l'SRD darebbe prima del 3° livello si decidono classe per classe all'importazione: chiedere all'autore |
| Combattere con Armi Possenti | Come SRD, ma il giocatore **sceglie** se ripetere i dadi che hanno dato 1 o 2 (domanda al giocatore; senza risposta non si ripete). Vale per l'arma da mischia a due mani, due mani o versatile, dichiarata dall'attacco con `twoHandedMelee: true` |
| Prepararsi | Come SRD. L'azione preparata si libera con la reazione (`action.ready-released`) e poi si esegue con lo stesso evento dell'azione e il flag `readied: true`, senza costi in più. Un attacco preparato è un solo attacco. Non gestito: muoversi alla massima velocità come azione preparata |
| Vicinanza nelle condizioni | Se un bersaglio è entro 1,5 m lo dice la scena: ogni attacco deve dichiarare `withinReach`, mai sottinteso. Da esso dipendono il vantaggio o svantaggio contro un prono e il critico automatico contro un paralizzato o privo di sensi |
| Attacchi di opportunità | Come SRD. Il sistema chiede la reazione; ostilità, vista e portata li verifica chi emette l'evento di uscita dalla portata. Non gestiti: teletrasporto e movimento forzato |
| Indomabile | Ripete lo stesso tiro con le stesse circostanze (modificatore e vantaggio o svantaggio); il nuovo risultato vale |
| Copertura | La assegna il DM a mano (parziale o totale, con i bonus alla CA); non si calcola dalla mappa |
| Luce e visione | Automatiche, calcolate da muri, porte e luci dell'editor di scena (ondata dedicata) |
| Veleni, malattie, trappole | Automatici: il motore applica danni e condizioni quando scattano; il DM può correggere |
| Ambiente (cadute, soffocamento, fame e sete, temperature estreme) | A mano del DM, con una **scheda di riferimento rapida** nell'interfaccia (danni e condizioni applicabili con pochi clic) |
| Viaggio ed esplorazione | A mano del DM, con una scheda di riferimento rapida |
| Peso | **Solo carico massimo**, legato alla Forza. Nessuna variante di ingombro. Pesi in **kg** |
| Monete | 5 monete come SRD (cambio 1:10) |
| Creazione dei punteggi | Tre metodi: serie standard, acquisto a punti, 4d6 scartando il più basso. Il tiro lo esegue il server e lo registra |
| PF per livello | Livello 1: massimo del Dado Vita + mod. COS. Livelli successivi: il giocatore sceglie tra tiro e media fissa (arrotondata per eccesso); il tiro lo esegue il server e lo registra. Nessun minimo per livello: l'SRD non lo prevede (vale solo la regola sull'arrotondamento qui sotto: i PF massimi mai sotto 1) |
| Arrotondamento dei PF massimi | Qualunque calcolo che modifica i PF massimi (per esempio il livello 4 di Indebolimento, che li dimezza) si arrotonda **sempre per difetto**, in qualsiasi contesto, ma **mai sotto 1**. Vale per le riduzioni e i ricalcoli; la media fissa dei PF per livello resta arrotondata per eccesso (riga "PF per livello") |
| Aumenti e talenti | Ai livelli 4, 8, 12, 16 e 19 si sceglie tra aumento dei punteggi e talento; alcune classi ne hanno di più (il Guerriero anche al 6 e al 14, il Ladro anche al 10), indicati dalla classe stessa |
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
- Un avanzamento con scelte in sospeso è indicato **appena il giocatore apre la lista dei personaggi**, con tutto ciò che richiede, e lo completa in un percorso guidato (anche fuori sessione). Il personaggio con scelte in sospeso **non entra in una scena**: l'avanzamento scatta al cambio scena, e il personaggio **entra nella scena successiva solo dopo che il suo giocatore ha completato le scelte** (compresa quella tra tiro e media dei PF, che non ha un valore provvisorio). L'attesa vale **solo per quel giocatore**: la scena parte per tutti gli altri senza aspettarlo. Se il giocatore è scollegato, vale lo stesso: quando si riconnette completa le scelte **prima di rientrare** nella scena. Non c'è un tempo massimo né un'eccezione: finché non sceglie, il personaggio resta fuori e il DM gioca senza di lui; il DM non sceglie al posto suo. Se salgono **più livelli insieme**, le scelte vanno **in coda, un livello per volta**, in un solo percorso guidato nell'ordine dei livelli. Le scelte le completa **solo il giocatore**; una correzione a scelta già confermata resta una modifica della scheda del DM, con storico. Le soglie di XP sono quelle dell'**SRD 5.1 italiano**, verificate sul testo, in un solo modulo con un test su ogni livello, uguali per tutte le classi.

### Riposi e incantesimi preparati

Quando il DM dichiara un riposo lungo durante la sessione, il sistema applica i recuperi (PF, Dadi Vita, slot) e **chiede a ogni giocatore** con incantesimi preparati se vuole cambiare la lista, nel rispetto delle regole SRD (numero massimo e incantesimi disponibili per la classe).

**Orologio di gioco.** Il tempo delle regole (per esempio le 24 ore tra due riposi lunghi) è tempo **di gioco**, non reale. Appartiene al **mondo** ed è un numero intero di minuti dall'inizio del mondo. Lo fanno avanzare il DM e le azioni automatiche: un riposo breve dura almeno 60 minuti, uno lungo almeno 480. Un riposo lungo non ha effetto se il precedente è finito meno di 24 ore di gioco prima (il DM può ignorare l'intervallo). Il motore non legge mai l'orologio reale.

## 8. Server

- **Comandi e eventi.** Il client invia comandi tipizzati (`token.move`, `roll.request`, `decision.answer`...). Il server li valida (schema Zod e permessi), li applica al motore, salva ciò che serve e trasmette eventi a tutti i client della stanza, filtrati per visibilità.
- **Stato live in memoria** per la scena attiva e gli scontri in corso, scritto su database a intervalli e a ogni evento importante. Nell'ondata 3 i token e il log del tavolo sono scritti subito a ogni comando (nessuna perdita se il servizio si riavvia); la memoria tiene solo chi è connesso. Quando arriveranno gli scontri con molto stato si potrà passare alla scrittura a intervalli. Un client che si riconnette riceve lo stato corrente. Poiché lo stato live è in memoria, il servizio gira in **una sola istanza**.
- **Connessione del tavolo.** Ogni comando (e ogni ping) riverifica la sessione di login con cui il socket è stato aperto: logout o scadenza chiudono la connessione (il logout subito, la scadenza al comando o al ping successivo). I frame sono giudicati all'arrivo, prima di accodarli: oltre il limite di frequenza si risponde con un errore, e chi insiste o accumula troppi comandi in attesa viene disconnesso. Rimuovere un membro avviene nella stessa coda dei comandi del tavolo. Anche il **puntatore** riverifica il login (la risposta si tiene per pochi secondi, perché arriva molte volte al secondo) e ha un limite **per persona**, non per connessione; una persona può tenere al massimo 4 connessioni a un tavolo, e la più vecchia viene chiusa (codice 4003) quando ne apre un'altra. Un testo sulla mappa non ha proprietario né immagine, non viaggia con il gruppo e non occupa un quadretto: non impedisce a un token di arrivare nella zona di partenza.
- **Aprire una scena o portarci tutti dall'atlante.** Il DM può aprire una scena al tavolo (`POST /api/worlds/:worldId/scenes/:sceneId/open`) o portare tutti lungo un'uscita della scena in gioco (`…/travel`): sono gli stessi comandi del tavolo (`scene.open`, `scene.travel`, nel modulo `table/commands.ts`), eseguiti nella coda della sessione, e senza una sessione in corso si rifiutano (409). La lettura della configurazione di una scena dice al DM se c'è una sessione in corso, quale scena si gioca e se è questa. Le uscite sono dati del DM: un giocatore non le vede.
- **Preparazione della scena.** Ha un WebSocket suo, `/api/worlds/:worldId/scenes/:sceneId/prepare`, solo per il DM e senza sessione: accetta soltanto i comandi sui token e sui testi (gli stessi del tavolo, nel modulo `table/commands.ts`), rifiuta chat, dadi, cambio scena e vista condivisa, e non inoltra il puntatore. La scena in gioco in una sessione in corso non si apre (409 `table.scene-in-play`); se viene aperta al tavolo mentre qualcuno la prepara, quella preparazione riceve l'errore e viene chiusa. Chi prepara riceve subito lo stato aggiornato quando la configurazione della scena viene salvata. I giocatori al tavolo non ricevono nulla di ciò che si prepara in un'altra scena.
- **Immagini.** Il DM le scarica tutte; un giocatore solo quelle usate ora da qualcosa che vede (la mappa della scena in gioco, il volto di un token non nascosto di quella scena), anche se conosce l'id (`apps/server/src/image-access.ts`). Ogni caricamento ha una riga nel database e un file. Un'immagine che nessuna scena o token usa più perde prima la riga e, solo dopo il commit, il file, dopo un'ora di tolleranza (si carica prima e si collega dopo); un file senza riga più vecchio di un'ora (upload interrotto, rimozione fallita) viene eliminato dallo stesso giro. Lo fa uno spazzino orario (`apps/server/src/image-gc.ts`), e in più al salvataggio e all'eliminazione di una scena; ogni errore è registrato nel log. Le immagini si servono con `Cache-Control: private, no-store` e il file si legge solo dopo il controllo di visibilità. Chi aggiunge una tabella che punta a `images` deve aggiungerla al controllo di `reclaimImages`, altrimenti le sue immagini verrebbero eliminate. Con l'atlante (ondata 3b) puntano a `images` anche le mappe delle regioni e dei luoghi e i token della libreria: vanno aggiunte a `reclaimImages` e a `image-access.ts`, e la mappa di una regione o di un luogo la scarica un giocatore solo se l'elemento è rivelato per lui; la libreria di token è solo del DM.
- **Account e sessione.** Nome utente (3-32 caratteri: lettere, numeri, punto, trattino, trattino basso; unico senza distinguere maiuscole) e password (10-128 caratteri) con argon2id. Cookie `httpOnly`, `sameSite=lax`, `secure` in produzione (disattivarlo in produzione è rifiutato all'avvio); nel database resta un HMAC del token, mai il token. Dopo 5 accessi falliti per lo stesso nome il server risponde 429 per 15 minuti. Le risposte d'errore sono `{ error: "errors.…" }`: chiavi del catalogo, il testo italiano lo mostra il client. **Qualunque account può creare un mondo e ne diventa il DM** (un solo DM per mondo, imposto da un indice del database).
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
| Preparare una scena (mappa, griglia, zona di partenza, token, testi) e gestire la libreria di token | No | Sì |
| Navigare le mappe dell'atlante (solo gli elementi rivelati) | Sì, in sola lettura | Sì, e le modifica |
| Correggere o forzare un passo automatico | No | Sì |

## 9. Modello dati

```
Account
 └─ WorldMembership (ruolo: dm | player) ── World
                                              ├─ Actor (PNG, mostri, compagni)
                                              ├─ Region (mappa) ── Area (poligono sulla mappa della regione) ── Place (pin nell'area, con una mappa) ── Scene (pin sulla mappa del luogo; la scena è l'unità giocata)
                                              ├─ TokenLibrary (token riutilizzabili del mondo, solo DM)
                                              ├─ SceneLink (da una scena a un'altra, scelto dal DM)
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

- **Gerarchia del mondo.** Il DM crea un **mondo**. Il mondo è composto da **regioni**, ogni regione da **aree**, ogni area da **luoghi**, ogni luogo da **scene**. Le scene sono quelle che si giocano: token, mappa e geometria stanno sulla scena, non sui livelli superiori. Ogni elemento appartiene a un solo elemento del livello sopra; una scena appartiene sempre a un luogo.
- **Atlante a mappe (ondata 3b, deciso dall'autore).** La gerarchia si costruisce su **mappe**, non da un elenco. Ogni **regione** ha una mappa (un'immagine caricata dal DM); le **aree** sono zone selezionate sulla mappa della regione, disegnate come **poligono a punti**; ogni **luogo** è un **pin** messo dentro un'area, sulla mappa della regione, e ha una **mappa** sua; ogni **scena** è un **pin** sulla mappa del luogo. La scena che si gioca (mappa da battaglia, griglia, token) è quella di prima. **Le mappe non sono obbligatorie** (deciso dall'autore): una regione può non avere mappa e un'area può non essere disegnata su una mappa. Dove c'è una mappa su cui mettere un elemento (la mappa della regione per un'area, l'area disegnata per un luogo, la mappa del luogo per una scena) l'elemento nasce piazzato su quella mappa; dove non c'è, si crea dal modulo con il nome e resta un normale elemento dell'elenco, senza posizione. I pin dei luoghi stanno sempre dentro un'area disegnata. I dati creati prima della 3b si convertono senza perdere nulla: ciò che potrebbe stare su una mappa che esiste e non è stato piazzato resta in un elenco transitorio «da piazzare», che il DM piazza sulle mappe oppure elimina, e che sparisce a conversione finita; ciò che non ha nessuna mappa sopra non aspetta niente. Valgono le regole di visibilità qui sotto e il server non invia ai giocatori né i pin né le mappe che non vedono; i giocatori navigano le mappe rivelate **in sola lettura**.
- **Preparazione della scena (ondata 3b).** Una scena si prepara **prima della sessione**, senza una sessione in corso: mappa, griglia, zona di partenza, token e testi. C'è **un solo stato** della scena: ciò che il DM prepara è ciò che trova quando la scena si apre in sessione, e ciò che si muove in gioco resta com'è alla fine; non esiste un secondo stato «preparato» da ripristinare. La scena che è in gioco in una sessione in corso non si apre in preparazione (si modifica dal tavolo); le altre sì, anche mentre una sessione è in corso, senza che i giocatori se ne accorgano. I personaggi dei giocatori non compaiono in preparazione: arrivano con l'ondata 2 (per ora un token con un proprietario assegnato).
- **Libreria di token del mondo (ondata 3b).** Il DM carica **una volta** i token del mondo (nome, immagine, taglia, colore) e li aggiunge alle scene quante volte vuole, in preparazione e in gioco. La libreria la vede solo il DM. I token piazzati sulle scene sono **copie indipendenti**: cambiare un token della libreria non cambia quelli già piazzati, e toglierlo dalla libreria non toglie quelli già piazzati.
- **Visibilità per i giocatori.** Ogni regione, area, luogo e scena ha un'indicazione **«rivelato»** che attiva il DM. Un giocatore vede un elemento solo se lui e tutti gli elementi sopra di lui sono rivelati; nascondere un elemento nasconde ciò che contiene, senza perdere le sue indicazioni. Le **note del DM** non arrivano mai ai giocatori. Un elemento si elimina solo se è vuoto. Fa eccezione la **scena con dei token**: il server la rifiuta (`world.scene-has-tokens`) e la elimina insieme ai suoi token solo se la richiesta lo chiede esplicitamente (`?withTokens=true`), dopo che il DM ha confermato nell'interfaccia; la scena in gioco in una sessione in corso non si elimina in nessun caso.
- **Ingresso nel mondo.** Il DM aggiunge un giocatore scrivendo il **nome utente** di un account esistente; può anche rimuoverlo. Non ci sono codici d'invito.
- **Sessioni.** Bozza → pubblicata → in corso → chiusa. Il DM può avviare anche una bozza. In un mondo c'è **una sola sessione in corso** (la impone un indice del database). Solo una bozza si elimina. I giocatori non vedono le bozze. La **nota di cronaca** si scrive durante la sessione o alla chiusura e si corregge dopo; la vedono tutti i membri.
- **Collegamento tra scene.** Il DM può **concatenare** le scene (`SceneLink`, da una scena a un'altra) per **spostare tutti da una scena all'altra** con una sola azione. Regole confermate dall'autore:
  - Si possono collegare scene anche di **luoghi, aree e regioni diversi**.
  - Da una scena possono partire **più uscite**: la catena non è lineare. Sulla mappa del luogo il DM le **traccia come frecce da un pin all'altro** (una scena può avere più frecce in uscita); per una scena di un altro luogo sceglie la scena di arrivo da un elenco. L'elenco delle uscite nella scheda della scena resta come alternativa.
  - Quando si cambia scena, per **ogni effetto attivo** (durata, concentrazione) di chi si sposta il sistema **chiede al DM «mantieni o termina»** con una richiesta di decisione, effetto per effetto (si realizza con l'ondata 6).
  - Si spostano i **personaggi** e i **PNG collegati al party** (per esempio un ostaggio o un famiglio). Gli altri attori restano dove sono.
  - I token compaiono nella **zona di partenza** (`startZone`) che il DM ha previsto nella scena di arrivo.
  - Lo spostamento **chiude la scena giocata** (con il suo rapporto di XP e loot) e ne apre una nuova.
  - Se lo spostamento fa **avanzare l'orologio di gioco** e di quanto lo decide il DM, **nella configurazione della scena**.
  - Se si può **uscire da una scena con un combattimento in corso** lo decide il DM, sempre **nella configurazione della scena**.
- L'appartenenza al mondo è una tabella con ruolo, **non** un campo `dm_id`. Oggi ammette un solo DM; passare a più DM sarà una modifica di regola, non di schema.
- Il mondo ha un **orologio di gioco** (`gameTime`, minuti interi). Ogni creatura ricorda quando è finito il suo ultimo riposo lungo.
- La scheda ha **campi del giocatore** (aspetto e storia alla creazione, scelte di livello) e **campi del mondo** (livello, XP, oggetti, oro, risorse). Questi ultimi li modifica solo il DM o il sistema, sempre con una riga di storico.
- Il modello prevede fin dall'inizio le **creature legate a un personaggio** (compagni, evocazioni, seguaci) e il **multiclasse** (più livelli di classe per personaggio, slot combinati).

## 10. Client

Pagine: accesso e registrazione; **lista dei personaggi** (stile selezione di World of Warcraft, con l'indicazione dell'avanzamento di livello in sospeso); creazione guidata; scheda in sola lettura (con le scelte consentite); diario personale e diario dell'avventura; pannello del mondo (con l'atlante a mappe, vedi sotto, e i collegamenti tra scene); bacheca delle sessioni (il DM pubblica titolo, data, livello consigliato, posti; i giocatori si iscrivono con un personaggio, il DM conferma; stati: bozza, pubblicata, in corso, chiusa); **tavolo live**; editor di scena per il DM.

Il tavolo live ha la **gestione della mappa di Owlbear Rodeo** (deciso dall'autore): la mappa occupa **tutta la finestra** (sopra l'intestazione del sito) e tutto il resto galleggia sopra, senza riquadri fissi. In alto a sinistra una barra con uscita, titolo della sessione, giocatori e chat/dadi (e, per il giocatore, l'elenco dei token); i pannelli si aprono sotto la barra, uno alla volta. In alto al centro le opzioni dello strumento in uso (compaiono solo se ne ha). A destra la colonna degli **strumenti**, ripiegabile: **Sposta (W)**, **Seleziona (S)**, **Misura (M)**, **Puntatore (Q)**, **Testo (T, solo DM)**; Draw e Fog arrivano con l'ondata 4a. In basso al centro la barra del DM (scene, token); in basso a destra il pulsante della scala (1,5 m) che apre i controlli della scena (griglia, mappa, zona di partenza, vista, «porta tutti alla mia vista»); in basso a sinistra l'aiuto. In preparazione manca il puntatore e c'è lo strumento **Zona di partenza (Z)**, che disegna sulla mappa la zona dove arrivano i giocatori. Si parte con **Sposta**, che muove solo la vista (rotella: zoom verso il cursore; tasto centrale: sposta in ogni strumento); i token si muovono con **Seleziona**, a rettangolo o a mano libera, con Maiusc per aggiungere o togliere; il token o il gruppo selezionato ha sotto di sé una barra (mostra/nascondi, duplica, elimina, altro). Il righello conta in modo scacchiera (un passo in diagonale vale uno) e dice i metri. Non ci sono annulla/ripeti (il server non tiene la cronologia delle mosse) né l'aggancio disattivabile: i token stanno sempre su un quadretto. **Tastiera:** la mappa si raggiunge con Tab; le frecce spostano la vista e più/meno ingrandiscono, e il resto si fa dall'elenco dei token (selezionare, muovere con le frecce dei dettagli, scrivere un testo). Righello e puntatore sono strumenti spaziali e non hanno ancora un'alternativa da tastiera. Ridimensionare la finestra conserva il punto in cui si guarda e lo zoom. Una selezione ad area con Maiusc aggiunge i token nuovi e toglie quelli già scelti. Per il movimento dei token il client applica subito la modifica in locale e la riconcilia con il server.

**Atlante a mappe (ondata 3b).** La struttura del mondo si vede e si modifica su mappe: la mappa della regione con le aree (poligoni a punti) e i pin dei luoghi; la mappa del luogo con i pin delle scene. Un clic su un'area o su un pin apre la mappa che contiene; in alto c'è il percorso (Regione › Area › Luogo) per tornare indietro. Il DM disegna, sposta e modifica aree e pin; i giocatori navigano solo ciò che è rivelato, in sola lettura. Le posizioni sulle mappe sono **frazioni della larghezza e dell'altezza** dell'immagine (0-1), così reggono a qualunque dimensione; l'area si ridisegna per intero (non si spostano i singoli vertici) e il pin si sposta trascinandolo. La mappa di una regione o di un luogo non si toglie finché ci sono elementi piazzati su di essa, e una forma che lascerebbe fuori dei luoghi non si accetta. Ai giocatori il client mostra ciò che è su una mappa e ciò che non ha una mappa su cui stare (senza mappe, tutto ciò che è rivelato). Le uscite si tracciano scegliendo prima la scena di partenza e poi quella di arrivo sulla mappa del luogo; si vedono come frecce tra due scene entrambe sul quel luogo, e una freccia scelta si elimina dalla sua riga. Le uscite verso scene di altri luoghi si fanno dall'elenco della scena. Il percorso in alto (Regione › Area › Luogo) si cammina un livello alla volta. Il pin di una scena apre la sua scheda con le **azioni dirette**: «Prepara», «Apri al tavolo» (con una sessione in corso) e «Porta tutti qui» (se dalla scena in gioco parte un'uscita verso di essa). Le azioni che cambiano il tavolo per tutti chiedono conferma al DM. Le uscite tra scene si tracciano come frecce tra i pin. L'elenco attuale resta solo come elenco transitorio «da piazzare» per i dati esistenti.

**Preparazione della scena (ondata 3b).** Dalla scena il DM apre la **stessa schermata del tavolo a schermo intero, in modalità preparazione**: senza chat né giocatori, solo per il DM, senza bisogno di una sessione. Ha gli stessi strumenti del tavolo e in più: carica e cambia la mappa, imposta e allinea la griglia, **disegna la zona di partenza dei giocatori** sulla mappa e la vede, aggiunge, sposta, nasconde e rimuove token e testi, e li aggiunge dalla libreria di token.

**Allineamento della mappa alla griglia (ondata 3b, come Owlbear Rodeo, verificato dall'autore nel suo Chrome).** In Owlbear si trova nella finestra di modifica della mappa (Asset Manager → Maps → matita → «Edit Defaults»), con una barra di strumenti (Pan, Transform, **Align**, Testo, Visibilità, Blocco) e il pulsante «Grid Preview». Align ha tre passi cliccabili, **Offset → Size → Refine**: (1) **Offset**, un'àncora al centro della mappa che si trascina sul punto che deve coincidere con un incrocio della griglia, con una lente d'ingrandimento a croce durante il trascinamento; (2) **Size**, un quadrato arancione che parte dall'àncora e si ridimensiona dall'angolo in basso a destra finché copre una casella disegnata sulla mappa; (3) **Refine**, la griglia calcolata sovrapposta alla mappa in linee arancioni, con un'àncora circolare sugli incroci da spostare per correggere la deriva in qualunque punto. Phoenix fa lo stesso nella preparazione della scena: dai tre passi si ricavano la **dimensione del quadretto** e lo **spostamento della griglia** (si possono digitare a mano anche dopo), con l'anteprima della griglia attivabile. Le due grandezze sono **numeri decimali** (due cifre), perché la rifinitura corregge la deriva su molte caselle e con pixel interi non basterebbe; la lente d'ingrandimento compare mentre si trascina una maniglia. Rotazione e ritaglio (lo strumento Transform di Owlbear) non sono inclusi.

**Libreria di token (ondata 3b).** Un pannello del DM con i token del mondo: si carica un token una volta (nome, immagine, taglia, colore), poi lo si trascina o lo si aggiunge a una scena, in preparazione e al tavolo.

**Design del client (vincolante per ogni sviluppo del frontend, deciso dall'autore).** Ispirato allo stile di Narrantium (solo il linguaggio visivo: nessuna immagine, logo o testo preso da lì): una biblioteca di notte con un filo d'oro. Superfici blu-nero (`#101318`, pannelli `#151a21`, linee `#2b303b`), testo osso, **oro** (`#e8a530`) per ciò su cui si agisce, **verde** per «visibile ai giocatori» o completato, **rosso** per pericolo o sessione in corso. Caratteri: **Cinzel** per titoli e nomi (le sue minuscole sono maiuscolette), **Inter** per l'interfaccia, **Lora** corsivo per i testi narrativi, tutti installati con `@fontsource`. Ornamenti: filetto d'oro con rombo sotto i titoli, ghirigori agli angoli dei pannelli importanti (`.framed`), cielo stellato e venatura del legno nell'accesso, pulsante principale con sfumatura e alone dorato (`.btn.hero`). Le variabili e le decorazioni stanno in `apps/client/src/style.css` e `decor.css`. Lo stato si mostra con un segno che ha un significato (il pallino «visibile ai giocatori»), non con la sola decorazione. Il movimento risponde a un'azione, salvo l'ingresso della scheda di accesso, e rispetta `prefers-reduced-motion`. Ogni nuovo schermo e componente (tavolo, editor di scena, scheda del personaggio, chat) segue questo linguaggio, **senza eccezioni**: si usano le variabili e le classi esistenti (`.btn`, `.btn.hero`, `.panel`, `.framed`, `.badge`, `.tabs`, `.ornament`...), niente colori, caratteri o ornamenti nuovi nei componenti. Il tavolo segue le stesse regole: i pannelli galleggianti sono `.hud` (posizione), `.hud-pill` (barre), `.hud-btn` (pulsanti con icona e suggerimento `data-tip`) e `.hud-panel` (pannelli), le icone stanno in `Icons.tsx` (tratti semplici nel colore corrente), la barra della selezione è `.sel-bar`. I colori dei token sono le variabili `--tk-*` di `style.css` (la tela PixiJS le legge da lì, mai colori scritti nel codice), la mappa sta in `.board`, i token in elenco usano `.dot`, i messaggi `.line` (tiri con filetto verde, riservati e sussurri con filetto oro tratteggiato). Se serve qualcosa che manca, si aggiunge a `style.css` nello stesso stile e si descrive qui. Un test (`scripts/design.test.ts`) fallisce se un componente scrive un colore o un carattere a mano.

**Editor di scena (DM, ondata 4a):** si costruisce sulla preparazione della scena dell'ondata 3b. Carica l'immagine della mappa e costruisce sopra muri, porte (aperte/chiuse), punti luce (raggio, intensità) e nebbia di guerra. Da questi dati il server calcola visione, luce e linea d'effetto per ogni giocatore.

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

Si consegna per ondate, ciascuna realmente usabile. Non iniziare un'ondata prima che quella che la precede **nell'ordine di consegna** abbia i test verdi.

**Ordine di consegna** (deciso dall'autore): 1 → **5a** → 3 → **3b** → **4a** → 2 → **5b** → **4b** → 6 → 7 → Railway. I numeri restano quelli storici; la 3b si aggiunge dopo la 3; la 4 è divisa in 4a e 4b per non anticipare la 2; l'ondata 5 è divisa in due perché una parte non dipende dai personaggi e una sì.

1. **Fondamenta.** Monorepo, tooling, lint sulle dipendenze, motore (`rules-core`) con eventi, pila di effetti, richieste di decisione, log; `rules-srd` con d20, vantaggio e svantaggio, caratteristiche e abilità, iniziativa, attacchi e danni, condizioni, morte, riposi; una classe di prova nei test; account con username e password.
2. **Personaggi.** Creazione guidata (tre metodi per i punteggi), scheda, storico delle modifiche, diari, avanzamento di livello con scelte in sospeso.
3. **Tavolo minimo.** Scena giocata, griglia, token, dadi e chat in tempo reale, con riconnessione; da qui si gioca una sessione di prova. Include, per decisione dell'autore: il **caricamento dell'immagine della mappa**, i **token nascosti**, il **filtro di visibilità** già presente nel protocollo (il server decide per ogni client cosa inviare; nell'ondata 3 la regola è «il DM vede tutto, il giocatore vede i token non nascosti», nella 4a diventa la visione calcolata) e lo **spostamento di tutti** da una scena all'altra.
3b. **Atlante e preparazione** (aggiunta dall'autore, dopo la 3 e prima della 4). Quattro pezzi, da consegnare in quest'ordine, ciascuno provabile da solo: (1) **allineamento della mappa alla griglia** come Owlbear Rodeo; (2) **preparazione della scena** prima della sessione, con zona di partenza, token e testi; (3) **atlante a mappe** (regione con mappa, aree a poligono, pin dei luoghi, mappa del luogo con i pin delle scene, solo mappa, conversione dei dati esistenti); (4) **libreria di token** del mondo.
4. **Editor di scena e visione**, in due parti:
   - **4a** (subito dopo la 3b, non dipende dai personaggi): editor di scena con muri, porte, luci; nebbia di guerra e strumenti Draw e Fog del tavolo; calcolo lato server di linea d'effetto e livello di luce; visione dei token con un **raggio di visione scelto dal DM sul token**, a mano.
   - **4b** (dopo la 5b): raggio e tipo di vista del token derivati dai **sensi del personaggio** (per esempio scurovisione), con il valore a mano del DM come correzione; le condizioni che dipendono dalla vista (lo Spaventato che «vede la fonte», la portata di 1,5 m) e la luce sulle prove.
5. **Mondi e sessioni**, in due parti:
   - **5a** (subito dopo l'ondata 1, non dipende dai personaggi): gerarchia del mondo (regioni, aree, luoghi, scene), collegamento delle scene, inviti e ingresso dei giocatori nel mondo, sessioni (creare, pubblicare, aprire, chiudere) con la bacheca senza iscrizioni, nota di cronaca a fine sessione. Lo **spostamento di tutti** da una scena all'altra si consegna con il tavolo (ondata 3), perché muove i token.
   - **5b** (dopo l'ondata 2): iscrizioni a una sessione con un personaggio, chiusura di scena con XP e loot.
6. **Automazione del combattimento.** Iniziativa, attacchi, reazioni, concentrazione, magia con aree, componenti, trappole, con override del DM e log leggibile. Il nucleo di turno, azioni, attacco, movimento e attacchi di opportunità è già in `rules-srd` (`turn-hooks.ts`, sullo stato `store` del motore); restano danno applicato ai PF, tiri salvezza, concentrazione, magia, geometria e Protezione.
7. **Contenuti.** Classi, razze, talenti, incantesimi, oggetti, mostri forniti dall'autore man mano, con copertura che cresce.

**Ultimo passo, dopo l'ondata 7: pubblicazione su Railway** (vedi sezione 11).

### Automazione delle condizioni: cosa arriva in quale ondata

Le regole delle condizioni sono funzioni di consultazione in `rules-srd`. Il collegamento automatico arriva con le parti da cui dipendono:

- **Ondata 1 (fatto):** modello sulla pila degli effetti, consultazioni (vantaggio e svantaggio, fallimenti automatici, velocità, difese), etichette sulle prove (vista, udito, sociale), immunità alle condizioni, costo di movimento (strisciare, alzarsi), fine della presa, divieto di avvicinarsi del Spaventato.
- **Ondata 4b (visione):** il controllo "vede la fonte" dello Spaventato e la portata di 1,5 m si ricavano dalla scena.
- **Ondata 6 (combattimento):** i ganci applicano le consultazioni su attacco, prova, salvezza e movimento; salvezze ripetute a fine turno; conseguenze a cascata (perdita di concentrazione se incapacitato, oggetti lasciati cadere da chi è privo di sensi, Indebolimento 6).
- **Ondata 2 (scheda) e riposi:** l'Indebolimento riduce i PF massimi sulla scheda con riga di storico (sempre arrotondati per difetto) e il riposo lungo ne toglie un livello.
- **Resta sempre al DM:** la narrazione dell'udito, i comportamenti dell'Affascinato oltre gli attacchi, l'inconsapevolezza del Pietrificato.

Fuori dalle prime ondate: mappa del mondo, voce e video, più DM per mondo, downtime.

**Definizione di "fatto" per ogni cambiamento:** i test passano, `pnpm typecheck` e `pnpm lint` sono puliti, i testi per l'utente sono nel catalogo italiano, e nessuna informazione riservata arriva a chi non deve vederla.

## 14. Come lavorare su questo progetto

- Parti sempre da un test che descrive la regola, poi scrivi il codice.
- Cambiamenti piccoli e verificabili. Se un compito è grande, spezzalo e dichiara come.
- Se una regola non è in questo file, vale l'SRD 5.1; se nemmeno l'SRD basta o hai un dubbio di prodotto, **fermati e chiedi all'autore**, indicando le opzioni.
- **Frontend:** ogni schermata segue il «Design del client» della sezione 10; prima di scrivere un componente rileggilo e guarda gli schermi esistenti.
- Non cambiare di tua iniziativa una scelta di questo documento. Se pensi che sia sbagliata, proponi la modifica e spiega perché.
- Dopo ogni regola o contenuto nuovo, aggiorna `docs/COVERAGE.md`.
- Questo file va aggiornato quando una decisione cambia: è la fonte di verità, non il codice.

## 15. Questioni ancora aperte

- **Rotazione e ritaglio della mappa** (lo strumento Transform di Owlbear): non sono nell'allineamento della 3b, da valutare dopo.
- Classi, razze, talenti, incantesimi, oggetti, mostri: arrivano dall'autore.
- **PF temporanei:** non sono ancora nel modello (`VitalState` ha solo PF e PF massimi). **Deciso:** un campo sulla creatura (`tempHp`), da fare nell'**ondata 6** insieme al danno applicato ai PF, rispettando le regole SRD verificate sul testo (non si sommano, assorbono il danno per primi; durata, due fonti, resistenze e morte da leggere sull'SRD), con una riga di log che dice quanto danno hanno assorbito. **Da non dimenticare.**
