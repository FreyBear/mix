# Drift og publisering (ESXi / Linux + Cloudflare)

Denne guiden beskriver hvordan du setter opp, publiserer og drifter **Mixup** på en egen Linux-VM (f.eks. på en ESXi VMware-server) med automatisk oppdatering via GitHub og sikker tilgang over internett med Cloudflare Tunnel.

---

## Arkitektur

```
[ Utvikler / Git ]
       │
       ▼ (push / PR)
[ GitHub Actions ] ──(kjører tester, bygger Docker-image)──► [ GitHub Container Registry (GHCR) ]
                                                                       │
                                                                       │ (Watchtower henter ny versjon)
                                                                       ▼
[ Internett / Brukere ] ◄──► [ Cloudflare Tunnel ] ◄──► [ Linux-VM (Docker Compose) ]
                               (Ingen åpne porter!)           └── Mixup (port 3000)
                                                             └── Watchtower (auto-update)
                                                             └── Persistent volum (mixup-data)
```

---

## 1. Forbered Linux-serveren (Ubuntu / Debian)

Logg inn på den nye Linux-VM-en din på ESXi og installer Docker og Git:

```bash
# Oppdater pakkebrønner og installer Docker og Git
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git

# Start Docker og sørg for at tjenesten starter ved server-omstart
sudo systemctl enable --now docker

# Gi brukeren din tilgang til å kjøre Docker uten 'sudo'
sudo usermod -aG docker $USER
```

*Logg ut av SSH-sesjonen og logg inn igjen for at gruppeendringen skal tre i kraft.*

---

## 2. Klon prosjektet og konfigurer miljøet

Klon repositoriet inn i hjemmemappen din:

```bash
git clone https://github.com/FreyBear/mix.git ~/mixup
cd ~/mixup
```

Opprett din produksjons-`.env`-fil fra malen:

```bash
cp .env.example .env
nano .env
```

Fyll inn verdiene:
```ini
# Start-PIN for dirigent ved 1. gangs oppstart (appen krever at du setter passord ved 1. innlogging)
ADMIN_PIN=1234

# Hemmelig nøkkel for signering av økter (generer med: openssl rand -hex 32)
SESSION_SECRET=sett_inn_din_tilfeldige_streng_her

# MÅ være true når appen kjører over HTTPS via Cloudflare
COOKIE_SECURE=true

# Sett false hvis du vil starte med helt tom database uten demodata
SEED_ON_EMPTY=true
```

> **Tips:** For å generere en sikker `SESSION_SECRET`, kjør denne kommandoen i terminalen og lim inn resultatet:
> ```bash
> openssl rand -hex 32
> ```

---

## 3. Start applikasjonen

I prosjektmappen (`~/mixup`) starter du containerne:

```bash
docker compose up -d
```

Dette gjør følgende:
1. Laster ned det nyeste ferdigbygde imaget fra GitHub Container Registry (`ghcr.io/freybear/mix:latest`).
2. Starter **Mixup** på port `3000`.
3. Starter **Watchtower** som sjekker GitHub hvert 5. minutt for nye versjoner og oppdaterer containeren automatisk.
4. Knytter databasen til det permanente volumet `mixup-data`.

Sjekk at containerne kjører:
```bash
docker compose ps
curl http://localhost:3000
```

---

## 4. Publiser sikkert med Cloudflare Tunnel

Med **Cloudflare Tunnel (`cloudflared`)** slipper du å åpne noen porter i ruteren (ingen port 80 eller 443 må forwardes), og du får automatisk HTTPS og DDoS-beskyttelse.

1. Logg inn på [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Gå til **Zero Trust** i venstremenyen → **Networks** → **Tunnels**.
3. Klikk **Create a tunnel** (velg *Cloudflared*).
4. Gi tunnelen et navn (f.eks. `mixup-server`).
5. Cloudflare viser en ferdig installasjonskommando for Linux (Debian/Ubuntu 64-bit). Kjør denne kommandoen i terminalen på Linux-VM-en:
   ```bash
   sudo cloudflared service install <ditt-tunnel-token>
   ```
6. Under **Public Hostname Page** i Cloudflare legger du inn:
   * **Subdomain:** f.eks. `kor` (eller `oppstilling`)
   * **Domain:** velg ditt domene (f.eks. `dittkor.no`)
   * **Service:** `HTTP`
   * **URL:** `localhost:3000`
7. Klikk **Save tunnel**.

Appen er nå umiddelbart tilgjengelig over internett på `https://kor.dittkor.no`!

---

## 5. Automatisk CI/CD og oppdateringer

Prosjektet er satt opp med GitHub Actions i `.github/workflows/ci.yml`:

* **Pull Requests:** 
  Hver gang en pull request opprettes, kjører GitHub automatiske tester:
  - ESLint kodekvalitet
  - TypeScript typesjekk
  - 29 automatiske logikk- og autentiseringstester
  - Verifisering av produksjonsbygg og Docker-kompilering
* **Push/Merge til `main`:**
  Når endringer merges til `main`, bygger GitHub et nytt Docker-image og publiserer det til `ghcr.io/freybear/mix:latest`.
* **Automatisk utrulling:**
  Watchtower på Linux-VM-en din oppdager det nye imaget innen 5 minutter, laster det ned og starter containeren på nytt.

### Manuell oppdatering (om du ikke vil vente på Watchtower)
```bash
cd ~/mixup
docker compose pull
docker compose up -d
```

---

## 6. Sikkerhetskopi (Backup)

Databasen ligger i Docker-volumet `mixup-data`. Du har to måter å ta backup på:

1. **Via nettleseren:** Gå til `/admin` → *Sikkerhetskopi* → *Last ned*. Dette gir en komplett JSON-fil som kan gjenopprettes på samme side.
2. **Direkte fra serveren:**
   ```bash
   # Kopier databasefilen ut fra containeren:
   docker compose cp mixup:/app/data/mixup.db ~/mixup-backup-$(date +%F).db
   ```
