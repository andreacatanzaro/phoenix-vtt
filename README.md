# Phoenix VTT

Tavolo virtuale web in italiano per D&D 5e (SRD 5.1). Le regole del progetto stanno in [AGENTS.md](AGENTS.md).

## Avvio in locale

Servono Node 26 (vedi `.nvmrc`), pnpm 12 e Docker.

```bash
pnpm install
pnpm dev          # docker compose: PostgreSQL, server (porta 3000) e client (porta 5173)
```

Apri http://localhost:5173. Per fermare e cancellare anche i dati locali: `docker compose down -v`.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `pnpm test` | Test (Vitest). I test del server usano PostgreSQL in memoria: non serve Docker |
| `pnpm typecheck` | Controllo dei tipi di tutti i pacchetti |
| `pnpm lint` | ESLint, con il grafo delle dipendenze tra pacchetti |
| `pnpm coverage:content` | Rigenera `docs/COVERAGE.md` |
| `pnpm coverage:check` | Fallisce se `docs/COVERAGE.md` non è aggiornato |

## Configurazione

Solo da variabili d'ambiente: `DATABASE_URL`, `SESSION_SECRET` (almeno 32 caratteri), e facoltative `PORT`, `HOST`, `COOKIE_SECURE`, `SESSION_DAYS`, `STATIC_DIR`. In produzione il cookie di sessione è sempre `Secure`: `COOKIE_SECURE=false` viene rifiutato, quindi l'immagine di produzione va provata dietro HTTPS (o con `NODE_ENV=development`). Nessun segreto nel repository: i valori di `docker-compose.yml` sono solo per l'uso locale.

## Licenza e attribuzione

Vedi [LICENSE](LICENSE) e [docs/SRD-ATTRIBUTION.md](docs/SRD-ATTRIBUTION.md).
