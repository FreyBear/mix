# Mixup

Åpen kildekode-PWA for kor som skal planlegge og visualisere **sceneoppstilling** på konserter og øvelser.
Dirigenten legger opp hvem som står hvor i hver sang. Sangerne åpner appen på mobilen, velger navnet sitt og ser
umiddelbart: *«Du står på Rad 2, plass 5 fra venstre (Tenor)»*.

Brukergrensesnittet er på norsk bokmål.

## Funksjoner

**For sangere**
- «Hvem er du?» (lagres i nettleseren), og «meg selv» utheves med pulserende ring og navnelapp
- Fast bunnlinje med rad, plass fra venstre og stemmegruppe, med sangvelger og forrige/neste
- Zoombart og panorerbart lerret (klyp, musehjul, dra) med *semantisk zoom*: initialer langt unna, kallenavn, stemme og høyde når du zoomer inn
- «Sett fra salen / Sett fra scenen», «Sentrer på meg» og «Nullstill zoom»
- Mørk modus og utskriftsvennlig visning
- Installerbar (PWA) og fungerer uten nett etter første besøk

**For dirigenten** (PIN-beskyttet)
- Redigering på fire måter: trykk-for-å-bytte, dra-og-slipp, hurtigmeny (solo, benk, lås, bytt stemmegruppe) og reservebenk
- Auto-sortering (høyde, høyeste bakerst, stemmegrupper i blokker, låste plasser beholdes). Radene fylles tett og jevnt, så det aldri blir hull i koret (solistens plass kan valgfritt holdes av som tomt spor)
- Form: rette rader eller bue/amfi (radius-slider), korbredde 30–100 % (standard 90 %), sikksakk-forskyvning, antall rader
- Kollisjonsadvarsel (rød ring) og varsel om sangere utenfor scenen
- Flere sanger per konsert: kopier forrige, maler, solister (midt / fordelt / par; behold eller lukk hull)
- Midlertidig stemmegruppe («Synger B (Fast: T)») med opprinnelig farge, stiplet kant og stjerne
- Oppmøteliste per konsert: de som er borte forsvinner fra oppstillingen, og kommer tilbake på sin plass

**Administrasjon** (`/admin`)
- Stemmegrupper med egne farger (fargevelger) og profiler SATB / SSAA / TTBB / S1 S2 A1 A2 T1 T2 B1 B2 (importen godtar «S1», «s 1», «Sopran 1» osv.)
- Sangere: opprett, rediger, slett, import fra CSV/tekst
- Lokasjoner (scenebredde/-dybde), konserter, sikkerhetskopi (JSON) og gjenoppretting

## Kom i gang

Krever Node.js 20 eller nyere (utviklet med Node 24).

```bash
npm install
npm run dev          # utvikling på http://localhost:3000
```

Produksjon:

```bash
npm run build
npm run start        # http://localhost:3000
```

Første gang opprettes databasen automatisk med demodata: et blandet SATB-kor med 32 sangere, tre lokasjoner og
konserten «Vårkonsert» med tre sanger.

Standard PIN-kode for dirigentmodus er **1234**. Bytt den i `.env` (se under).

## Konfigurasjon

Kopier `.env.example` til `.env`:

| Variabel         | Standard           | Forklaring                                             |
| ---------------- | ------------------ | ------------------------------------------------------ |
| `ADMIN_PIN`      | `1234`             | Dirigentens PIN-kode                                   |
| `SESSION_SECRET` | avledet fra PIN    | Hemmelighet for signering av innloggings-cookie        |
| `DATABASE_PATH`  | `./data/mixup.db`  | Sti til SQLite-filen                                   |
| `COOKIE_SECURE`  | `false`            | Sett `true` når appen kjører bak HTTPS                 |
| `SEED_ON_EMPTY`  | `true`             | `false` hindrer automatisk demodata i tom database     |

## Docker

```bash
ADMIN_PIN=min-pin docker compose up -d --build
```

Appen kjører på <http://localhost:3000>, og databasen ligger i volumet `mixup-data`.

## Nyttige kommandoer

```bash
npm test                       # logikktester (layout, auto-sortering, backup, import …)
npm run typecheck              # TypeScript
npm run lint                   # ESLint
npm run db:seed                # fyll tom database med demodata
npm run db:seed -- --reset     # slett alt og start på nytt med demodata
```

Sikkerhetskopi: `/admin` → *Sikkerhetskopi* → *Last ned* gir en JSON-fil med alt. Samme side gjenoppretter fra fil.

## Teknologi

Next.js (App Router), TypeScript, Tailwind CSS, Lucide-ikoner, SQLite via `better-sqlite3`. Lerretet er ren SVG med
egen håndtering av panorering, klyping og dra-og-slipp.

```
src/app            sider og API-ruter (/api/…)
src/components     brukergrensesnitt (lerret, redigeringspanel, admin …)
src/lib            geometri (layout.ts), plassering/auto-sortering (placement.ts), database (db.ts, repo.ts)
scripts            seed, logikktester, API-røyktest
public/sw.js       service worker (PWA)
```

## Lisens

MIT, se [LICENSE](LICENSE).
