# SH | Personāls — iestatīšana

**Kā tas strādā:** lietotne (šī repozitorija saknē) atrodas GitHub Pages — `https://vaitkevix.github.io/personals/`.
Dati glabājas tavā esošajā personāla Google Sheets tabulā, un Apps Script tajā ir API (tāpat kā Aizvietošanā).

| Loma | Ko redz un dara |
|---|---|
| **Darbu vadītājs** | Piesaka jaunu darbinieku un atvaļinājumu. Redz savus pieteikumus un to statusu, kā arī kalendāru. |
| **Admins** | Redz visus pieteikumus, maina statusu (Jauns / Apstrādē / Apstiprināts / Noraidīts) ar komentāru. |

Pēc katra jauna pieteikuma personāla vadītāja saņem e-pastu (lapa **Iestatījumi → ADMIN_EMAIL**).

---

## 1. Apps Script (esošajā tabulā)

1. Atver savu personāla Google Sheets tabulu → **Paplašinājumi → Apps Script**.
2. Failā **Code.gs** iezīmē visu un ielīmē `apps-script/Code.gs` saturu → saglabā.
3. Palaid **setup → Run** (esošos datus tas neaiztiek, tikai pievieno trūkstošo).
4. Lapā **Lietotāji** katram cilvēkam jābūt **savs PIN** — lietotnē ienāk ar vārdu (kolonna Vārds) un PIN.
5. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
   - Execute as: **Me**, Who has access: **Anyone**
6. Nokopē **Web app URL** (beidzas ar `/exec`).

> Vecā saite (script.google.com/…/exec) pārlūkā turpina rādīt veco lietotni, kamēr projektā ir fails **Index**.

## 2. GitHub Pages

1. GitHub izveido jaunu repozitoriju **`personals`** (Public), tāpat kā `aizvietosana`.
2. Augšupielādē visus šīs mapes failus repozitorija saknē (`index.html`, `config.js`, `manifest.json`, `icon.png`, mapi `icons`).
3. Failā **`config.js`** ielīmē `API_URL` no 1. soļa.
4. **Settings → Pages → Branch: main / (root) → Save**.
5. Pēc 1–2 minūtēm lietotne strādā: `https://vaitkevix.github.io/personals/`

## 3. E-pasta poga

Lapā **Iestatījumi** rindā **WEB_APP_URL** ieraksti `https://vaitkevix.github.io/personals/` — tad poga „Atvērt sistēmu” e-pastā ved uz lietotni.

## 4. Telefonā kā lietotne

iPhone: atver saiti **Safari** → **Kopīgot** → **Pievienot sākuma ekrānam**. Android: Chrome izvēlne ⋮ → **Instalēt lietotni**.

© VAITKEVIX, SIA. Visas tiesības aizsargātas.
