# Rolle og mandat
Du er en senior fullstack-utvikler. Bygg en komplett, moderne og responsiv webapplikasjon fra bunnen av i dette arbeidsområdet. Dette er en open-source webapplikasjon for kor til planlegging og visualisering av sceneoppstillinger under konserter og øvelser. Den skal fungere like sømløst som en mobilapp (PWA-stil) på mobil som på PC og storskjerm.

# Autonomi og One-Shot instruks
- Jobb 100% autonomt fra start til slutt. IKKE still oppfølgingsspørsmål eller be om bekreftelser underveis.
- Ta egne robuste tekniske, arkitektoniske og estetiske valg der detaljer ikke er spesifisert.
- Bruk terminalen til å opprette prosjektet, installere pakker, generere database/skjemaer og fikse eventuelle feil.
- Du er ferdig først når koden bygger og kjører feilfritt.

# Teknologistakk
- **Rammeverk:** Next.js (App Router), TypeScript, Tailwind CSS, Lucide-ikoner.
- **Database & Lagring:** SQLite med Prisma (eller better-sqlite3) for portabilitet uten eksterne skytjenester. Inkluder seed-data med et blandakor (SATB, ca. 25–35 sangere) og et par forhåndsdefinerte scener/lokasjoner.
- **Interaktivt lerret / Scene:** SVG med touch- og pekerhåndtering (pinch-to-zoom, pan, drag-and-drop og tap-to-swap).

---

# Kjernefunksjonalitet

### 1. Stemmegrupper og fargekontroll
- **Egendefinerte farger:** Hver stemmegruppe har navn, forkortelse og en unik farge (hex/fargekode).
- **Admin fargekontroll:** I adminpanelet kan dirigent/admin opprette, redigere, slette stemmegrupper og tildele egne farger via en innebygd fargevelger (color picker).
- **Standardprofiler:** Tilby forhåndsutfylte profiler (SATB, SSAA, TTBB) med distinkte standardfarger, men la alt kunne redigeres fritt.

### 2. Sangerkartotek & Konsertoppmøte (Deltakerhåndtering)
- **Sanger-felter:**
  - `fullName`: Fullt navn.
  - `nickname`: Kallenavn / kortnavn (brukes primært i scenekartet og ved zoom).
  - `voiceGroup`: Fast tilhørende stemmegruppe.
  - `height`: Høyde i cm.
  - `isActive`: Om sangeren er aktiv i koret.
- **Admin CRUD:** Dirigent/admin kan legge til, redigere og slette sangere via administrasjonspanelet. Støtte for rask import via CSV eller ren tekstliming.
- **Konsertoppmøte (Attendance checklist):**
  - Når en konsert opprettes, inkluderes automatisk alle aktive korister som standard (`deltar = true`).
  - Dirigenten har en rask sjekkliste for konserten: «Deltakelse», hvor man kan hake vekk de som har meldt forfall.
  - Kun avhukede deltakere sendes videre til scenegeneratoren og oppstillingene for den konserten.

### 3. Scenemodell, Lokasjoner og Geometri
- **Lokasjonsbibliotek (Venue presets):**
  - Mulighet til å lagre og gjenbruke scener/lokasjoner (f.eks. «Kulturhuset - Hovedscene (12m x 7m)», «Domkirken (8m x 5m)»).
  - Ved valg av lokasjon oppdateres scenestørrelsen (bredde og dybde i meter) automatisk. Egendefinerte mål kan også tastes inn direkte.
- **Bredde-slider:**
  - Slider som styrer korets maksimale bredde i prosent av scenen (30% – 100%, standard: 90%). Koret sentreres automatisk.
- **Form og radgeometri:**
  - Valg mellom **Rette rader** og **Bue / Amfi**.
  - **Amfi-slider (Radius):** Ved bueform skal en dedikert glidebryter justere kurvaturen/radiusen på buen (fra slak til krapp amfi).
  - **Sikksakk / Windowing:** Toggle/avkryssing for «Forskyv rader (sikksakk)». Annenhver rad forskyves automatisk med en halv plassbredde sidelengs, slik at sangere bak ser i mellomrommet mellom hodene foran.
- **Fysiske dimensjoner og kollisjonsvarsel:**
  - Hver sanger tegnes som en sirkel/oval som representerer en menneskekropp (ca. 55 x 40 cm).
  - Kollisjonsadvarsel (visuell rød ring) og varseltekst dersom sangere står for tett på en rad.

### 4. Kart-aktig mobilvisning med Pan & Pinch-to-Zoom
- Skalerbart SVG-lerret som støtter jevn zooming (pinch på mobil, musehjul på desktop) og panorering (dra).
- Hurtigknapper for «Sentrer på meg» og «Nullstill zoom».
- **Semantisk Zoom (Level of Detail / LOD):**
  - **Lav zoom (Oversikt):** Sangerne viser farge og **kun initialer** basert på kallenavnet.
  - **Høy zoom (Nærbilde):** Skifter automatisk over til **kallenavn**, stemmegruppe og høyde.
- **Perspektiv-vender:** Knapp for å veksle mellom «Sett fra salen» (Dirigent) og «Sett fra scenen» (Sanger - speilvender venstre/høyre).

### 5. Sanger-opplevelse på mobil (Standardmodus)
- **Ingen innlogging kreves:**
  - Dropdown øverst: «Hvem er du?». Valget lagres i `localStorage` slik at mobilen husker brukeren.
- **«Meg selv»-fremheving:**
  - Brukerens egen sirkel markeres med egen kontrastfarge, pulserende ring, og navnet er synlig uansett zoomnivå.
  - Klebrig bunnlinje (sticky bar) på mobil:
    «Du står på Rad [X], plass [Y] fra venstre ([Aktiv stemmegruppe])».
- **Konsertnavigasjon:**
  - Nummerert dropdown og forrige/neste-piler for å bla mellom sangene i konserten.

### 6. Konserter, Scener, Solister og Midlertidig Stemmegruppe
- En konsert har flere scener/sanger (f.eks. «1. Introitus», «2. Solo-ballade», «3. Finale»).
- **Kopier forrige oppstilling:** Knapp for å duplisere oppsettet fra forrige sang med ett klikk.
- **Lagre oppstillinger:** Mulighet til å lagre oppsett som gjenbrukbare maler.
- **Solist-håndtering:**
  - Markere én eller flere sangere som solister i gjeldende sang.
  - Eget solistfelt foran koret (valg: samlet i midten, spredt jevnt foran, eller to-og-to).
  - Valg for om solistens opprinnelige korplass skal beholdes som et tomt spor eller trekkes sammen.
- **Midlertidig stemmegruppe (Voice Group Override):**
  - En sanger kan tildeles en midlertidig stemmegruppe for den gjeldende scenen/sangen (f.eks. en T2 som synger B1).
  - **Visningsregel for farge:** Sangeren **beholder sin opprinnelige farge** (f.eks. T2-farge), men plasseres fysisk sammen med den nye stemmegruppen (f.eks. B1-blokken).
  - Noden får en diskret markering (f.eks. en liten stjerne eller stiplet kant) som viser at den er utlånt, og ved zoom/trykk vises teksten: «Synger B1 (Fast: T2)».
  - Auto-sortering tar hensyn til den nye gruppen ved plassering.

### 7. Manuell redigering & Dirigentmodus
- **Dirigent-lås:** Beskyttet med PIN/passord (standard: 1234, definerbar i `.env`).
- **Auto-sortering:** Sorterer automatisk etter høyde (høyeste bakerst) kombinert med stemmegrupper. Låste plasser flyttes ikke.
- **Fire samtidige redigeringsmetoder uten konflikt:**
  1. **Tap-to-Swap:** Trykk for å velge sanger -> trykk på en annen sanger for å bytte, eller tom plass for å flytte.
  2. **Dra-og-slipp:** Direkte flytting/bytte med mus eller finger.
  3. **Hurtighandlinger (Tooltip):** Popup ved trykk med knapper for: «Gjør til solist», «Send til benk», «Lås posisjon (Pin)» og «Endre stemmegruppe (kun denne sangen)».
  4. **Reservebenk:** Skuff under scenen for deltakere som har pause i den aktuelle sangen.

### 8. Administrasjon, Sikkerhetskopi & Open Source
- **Sikkerhetskopi i UI:** Knapper for «Last ned backup (JSON)» og «Gjenopprett fra JSON» i admin-menyen.
- **Utskrift:** Utskriftsvennlig CSS for PDF/papir.
- **Dokumentasjon & Kjøring:** God `README.md` med oppstartsguide og `docker-compose.yml`.

---

# Definition of Done
1. Alle pakker installert, SQLite-database migrert og seeded med blandakor, testlokasjoner og konfigurerbare stemmegrupper med fargevelger.
2. Sangerkartotek med full CRUD og forfalls-/oppmøtesjekkliste per konsert fungerer.
3. Lerretet har fungerende amfi-slider (radius), korbredde-slider (90% standard) og sikksakk/windowing-bryter.
4. Midlertidig stemmegruppe fungerer slik at sangeren plasseres i ny gruppe, men beholder sin opprinnelige fargekode med en synlig utlånt-indikator.
5. Zoom (pinch/pan), semantisk tekstvisning (initialer -> kallenavn), og «Meg selv»-lagring i localStorage fungerer feilfritt.
6. Tap-to-Swap, Drag-and-Drop, hurtigmeny med Pin og reservebenk fungerer sømløst.
7. `npm run build` bygger med exit code 0 uten feil.
8. Applikasjonen kan startes lokalt med `npm run start`.