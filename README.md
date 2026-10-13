# Mixup

Åpen kildekode-PWA for kor som skal planlegge og visualisere **sceneoppstilling** på konserter og øvelser.
Dirigenten legger opp hvem som står hvor i hver sang. Sangerne åpner appen på mobilen, velger navnet sitt og ser
umiddelbart: *«Du står på Rad 2, plass 5 fra venstre (Tenor)»*.

Brukergrensesnittet er på norsk bokmål.

## Funksjoner

**For sangere (åpen tilgang)**
- «Hvem er du?» (lagres i nettleseren), og «meg selv» utheves med pulserende ring og navnelapp
- Fast bunnlinje med rad, plass fra venstre og stemmegruppe, med sangvelger og forrige/neste
- Zoombart og panorerbart lerret (klyp, musehjul, dra) med *semantisk zoom*: initialer langt unna, kallenavn, stemme og høyde når du zoomer inn
- Mørk modus og utskriftsvennlig visning
- Installerbar (PWA) og fungerer uten nett etter første besøk
- Personvern: Sangerhøyder eksponeres kun for innlogget dirigent/admin

**For dirigenten (passordbeskyttet)**
- Redigering på fire måter: trykk-for-å-bytte, dra-og-slipp, hurtigmeny (solo, benk, lås, bytt stemmegruppe) og reservebenk
- Auto-sortering (høyde, høyeste bakerst, stemmegrupper i blokker, låste plasser beholdes). Radene fylles tett og jevnt, så det aldri blir hull i koret (solistens plass kan valgfritt holdes av som tomt spor)
- Form og geometri: én slider for bue/amfi (helt til venstre = rette rader), sangeravstand (tett til luftig, 60–110 cm), antall rader
- Individuell radjustering: forskyvning og utstrekning (spredning) per enkelt rad
- Kollisjonsadvarsel (rød ring) og varsel om sangere utenfor scenen
- Flere sanger per konsert: kopier forrige, solister (midt / fordelt / par; behold eller lukk hull)
- Midlertidig stemmegruppe («Synger B (Fast: T)») med opprinnelig farge
- Oppmøteliste per konsert: de som er borte forsvinner fra oppstillingen, og kommer tilbake på sin plass

**Administrasjon (`/admin`)**
- Stemmegrupper med egne farger (fargevelger) og profiler SATB / SSAA / TTBB / S1 S2 A1 A2 T1 T2 B1 B2 (importen godtar «S1», «s 1», «Sopran 1» osv.)
- Sangere: opprett, rediger, slett, import fra CSV/tekst
- Lokasjoner (scenebredde/-dybde), konserter, sikkerhetskopi (JSON) og gjenoppretting
- **Sikkerhet**: Eget passordbytte for innlogget rolle, samt administratortilgang til å tilbakestille dirigentens passord til standardkode

## Tilgangskontroll og sikkerhet

Appen har to adgangsnivåer for å sikre at korets data er beskyttet når appen er publisert på internett:

1. **Dirigent (`conductor`)**
   - **Standardpassord:** `1234`
   - Ved første gangs pålogging krever appen at dirigenten oppretter et eget, sikkert passord.
   - Har tilgang til konsertredigering, scenegeometri, sangeroppsett og administrasjon.
2. **Super-Admin (`superadmin`)**
   - **Standardpassord:** `987654321`
   - Ved første gangs pålogging krever appen at admin oppretter et eget, sikkert passord.
   - Har full tilgang til alt dirigenten har, pluss rettighet til å **tilbakestille dirigentens passord tilbake til 1234** (under `/admin` → *Sikkerhet*). Dirigenten vil da bli pålagt å opprette et nytt passord ved neste innlogging.

**Sikkerhetstiltak i produksjon:**
- **Passordhashing:** Alle passord hashes med saltet `scrypt` i databasen (`app_config`). Ingen passord lagres i klartekst.
- **Brute force-vern:** Innebygd rate-limiting per klient/IP som låser forsøk i 60 sekunder etter gjentatte feilforsøk.
- **Økt-ugyldiggjøring:** Sesjonstokens er kryptografisk signert med hash-stempel; endring eller tilbakestilling av et passord ugyldiggjør alle eksisterende økter umiddelbart.
- **Søkemotorblokkering:** `public/robots.txt` (`Disallow: /`) forhindrer søkemotorer i å indeksere sanger- og konsertopplysninger.

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

Logg inn med dirigentpassord **1234** eller adminpassord **987654321**. Du blir automatisk bedt om å opprette et personlig passord ved første gangs innlogging.

## Konfigurasjon

Kopier `.env.example` til `.env`:

| Variabel         | Standard           | Forklaring                                             |
| ---------------- | ------------------ | ------------------------------------------------------ |
| `ADMIN_PIN`      | `1234`             | Standard dirigentkode ved initiering                   |
| `SESSION_SECRET` | auto-generert      | Hemmelighet for signering av innloggings-cookie        |
| `DATABASE_PATH`  | `./data/mixup.db`  | Sti til SQLite-filen                                   |
| `COOKIE_SECURE`  | `false`            | Sett `true` når appen kjører bak HTTPS                 |
| `SEED_ON_EMPTY`  | `true`             | `false` hindrer automatisk demodata i tom database     |

## Docker

```bash
docker compose up -d --build
```

Appen kjører på <http://localhost:3000>, og databasen ligger i volumet `mixup-data`.

## Nyttige kommandoer

```bash
npm test                          # kjører alle logikk- og autentiseringstester
npm run typecheck                 # typekontroll med TypeScript
npm run lint                      # kodekvalitetssjekk med ESLint
npm run db:seed                   # fyll tom database med demodata
npm run db:seed -- --reset        # slett alt og start på nytt med demodata
npm run db:clear                  # slett all demodata (sangere, konserter, scener) for et tomt kor
npm run auth:reset                # tilbakestill dirigent (1234) og admin (987654321)
npm run auth:reset -- --conductor # tilbakestill kun dirigentpassord til 1234
npm run auth:reset -- --admin     # tilbakestill kun adminpassord til 987654321
```

Sikkerhetskopi: `/admin` → *Sikkerhetskopi* → *Last ned* gir en JSON-fil med alt. Samme side gjenoppretter fra fil.

## Teknologi

Next.js (App Router), TypeScript, Tailwind CSS, Lucide-ikoner, SQLite via `better-sqlite3`. Lerretet er ren SVG med
egen håndtering av panorering, klyping og dra-og-slipp.

```
src/app            sider og API-ruter (/api/…)
src/components     brukergrensesnitt (lerret, redigeringspanel, admin …)
src/lib            geometri (layout.ts), plassering/auto-sortering (placement.ts), database (db.ts, repo.ts), autentisering (auth.ts)
scripts            seed, logikk- og autentiseringstester, tilbakestilling av passord, API-røyktest
public/robots.txt  søkemotorblokkering
public/sw.js       service worker (PWA)
```

## Lisens

MIT, se [LICENSE](LICENSE).
