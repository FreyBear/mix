# Sikkerhetskopi og gjenoppretting (Google Drive & Rclone)

Mixup har et helautomatisk, «set-and-forget» backup-system for produksjonsmiljøer.

Hver sikkerhetskopi inneholder:
1. **`mixup.sqlite`**: En 100 % konsistent kopi av hele SQLite-databasen (med flushet WAL-journal). Inneholder alt: korister, konserter, scener, innloggingspassord og systemoppsett.
2. **`mixup-backup.json`**: Den standardiserte Mixup-sikkerhetskopien. Denne kan lastes ned og importeres direkte i nettleseren på `/admin` på en hvilken som helst annen instans.
3. **`mixup.env`**: Kopi av miljøvariabler og krypteringsnøkler.
4. **`backup-meta.json`**: Sammendrag over antall korister, scener, konserter og tidsstempel.

Alt pakkes sammen i et komprimert arkiv: `mixup-backup-YYYY-MM-DD_HHMMSS.tar.gz`.

---

## 1. Rask manuell kjøring

Ta en øyeblikkelig sikkerhetskopi lokalt:
```bash
~/mix/scripts/backup.sh
```
Filene lagres i `~/mixup-backups/`.

Gjenoppretting fra en sikkerhetskopi:
```bash
~/mix/scripts/restore.sh ~/mixup-backups/mixup-backup-YYYY-MM-DD_HHMMSS.tar.gz
```

---

## 2. Koble til Google Drive med Rclone (Engangsjobb)

Rclone håndterer automatisk fornyelse av tilgangsnøkler (OAuth tokens) mot Google i bakgrunnen for alltid.

### Steg 2.1: Start veiviseren
Kjør:
```bash
rclone config
```

### Steg 2.2: Svar på spørsmålene i veiviseren
1. Velg `n` for **New remote**.
2. **name:** Skriv `gdrive` (viktig: skriptet leter etter `gdrive` som standard).
3. **Storage>:** Finn nummeret for **Google Drive** (eller skriv `drive`).
4. **client_id>:** Trykk bare `Enter` (blank).
5. **client_secret>:** Trykk bare `Enter` (blank).
6. **scope>:** Skriv `3` (eller `drive.file`).
   * *Dette gir Rclone kun tilgang til mappen den selv oppretter for Mixup, og IKKE til resten av dine personlige filer på Google Drive.*
7. **service_account_file>:** Trykk `Enter` (blank).
8. **Edit advanced config?>:** Trykk `Enter` (for `n` / Nei).
9. **Use web browser to automatically authenticate?>:**
   * Siden serveren er hodeløs (uten grafisk skjerm): Svar `n` (Nei).
   * Rclone vil nå be deg kjøre en autorisasjonskommando på din egen PC (Mac/Windows/Linux med nettleser):
     ```bash
     rclone authorize "drive" "..."
     ```
     *Tips:* Har du ikke rclone på din lokale PC, kan du laste det ned fra [rclone.org/downloads](https://rclone.org/downloads/), eller velge web-lenken som rclone oppgir.
   * Når du godkjenner i nettleseren din, får du en tilgangskode/token. Lim denne inn i terminalen på serveren.
10. **Configure this as a Shared Drive?>:** Svar `n` (Nei, med mindre du bruker Google Workspace Shared Drive).
11. **Keep this "gdrive" remote?>:** Svar `y` (Ja).
12. **Quit config:** Svar `q`.

### Steg 2.3: Test at det virker
```bash
rclone lsd gdrive:
```
Kjør deretter backup-skriptet for å verifisere opplasting til Google Drive:
```bash
~/mix/scripts/backup.sh
```
Du vil nå se mappen `Mixup-Backups` direkte i din Google Drive!

---

## 3. Automatiser med Cron (Hver natt kl. 03:00)

Åpne crontab på serveren:
```bash
crontab -e
```

Legg til følgende linje nederst:
```cron
0 3 * * * /home/ingve/mix/scripts/backup.sh >> /home/ingve/backup.log 2>&1
```

* Nå tas det automatisk backup hver eneste natt klokken 03:00.
* Backuper lastes opp til mappen `Mixup-Backups` på din Google Drive.
* Sikkerhetskopier eldre enn 30 dager slettes automatisk både lokalt og på Google Drive for å spare plass.
* Du kan sjekke loggen når som helst med: `tail -n 50 ~/backup.log`.

---

## 4. Konfigurasjonsmuligheter (.env)

Hvis du vil overstyre standardinnstillinger, kan du legge til disse i prosjektets `.env`:

```env
# Endre målmappe på Google Drive eller annen Rclone-remote
BACKUP_RCLONE_REMOTE=gdrive:MinEgendefinerteMappe

# Hvor mange dager backup skal beholdes (standard: 30)
BACKUP_RETENTION_DAYS=60

# Egendefinert lokal lagringsmappe (standard: ~/mixup-backups)
BACKUP_DIR=/home/ingve/mixup-backups
```
