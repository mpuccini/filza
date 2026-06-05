# CLAUDE.md

Istruzioni per Claude e altri agenti AI che lavorano in questo repository.

## Panoramica del progetto

Filza è una webapp standalone (zero backend, zero build step) che genera
metadati METS ECO-MiC 1.2 per archivi storici digitalizzati.

Ha due modalità operative:

1. **Batch da Excel** (tab principale): legge un foglio `Modello_MetadatiScansioni.xlsx`
   compilato dagli archivisti, genera un XML METS per ogni unità documentaria e
   lo scrive nella cartella `mets/` della relativa sottocartella su disco.

2. **Singola cartella** (tab secondario): drag&drop di una cartella PND, anteprima
   XML, validazione, export — flusso interattivo uno-per-uno.

**Stack:** HTML + JS vanilla + React 18 via CDN + `htm` (JSX senza Babel)
+ SheetJS 0.20 via CDN.

## Layout file

```
filza/
├── index.html              Entry point: carica CDN + script locali
├── css/
│   └── styles.css          Stili
├── js/
│   ├── app.js              UI React completa (entrambi i tab)
│   ├── mets-generator.js   Generatore METS da struttura cartelle (tab singolo)
│   ├── excel-processor.js  Parser Excel + ExcelMETSGenerator + ExcelBatchProcessor
│   └── api-validator.js    Client API Cineca ECO-MiC
├── avvia_filza.bat         Launcher Windows
├── filza_server.ps1        Server HTTP PowerShell (usato da avvia_filza.bat)
├── GUIDA_UTENTE.txt        Guida per archivisti non tecnici
├── README.md               Documentazione tecnica
└── CLAUDE.md               Questo file
```

## Vincoli da rispettare

- **No build step.** Tutto deve girare aprendo `index.html` o servendolo
  staticamente. Niente webpack/npm/bundler. Dipendenze esterne solo via CDN.
- **No backend.** La persistenza usa `localStorage` (archivi configurati, log,
  checkpoint batch). I file XML vengono scritti su disco via File System Access API.
- **Compatibilità Chrome/Edge** come primary target.
  Su Firefox mancano `showDirectoryPicker` e `createWritable` → degradare
  con messaggio esplicito (già gestito).
- **METS valido ECO-MiC 1.2**: testare ogni cambio al generatore contro
  l'API Cineca (`api-validator.js`).

## Convenzioni nomenclatura PND

> `<CodiceIstituto>+<CodiceOggetto>+<NumeroProgressivo>.<estensione>`

- `+` come unico separatore di alto livello.
- `NumeroProgressivo`: **5 cifre** con zero padding.
- Recto/verso: non nel nome file, ma nei metadati METS (LABEL) e nell'Excel.
- Il `USE` METS è determinato dall'**estensione** del file, con fallback al
  nome cartella.

Parser autoritativi in `mets-generator.js`:
- `METSGenerator.parseFolderName(name)` → `{codiceIstituto, codiceOggetto}` o `null`
- `METSGenerator.parseFileName(name)` → `{progressivo, progressivoStr, lato, ext}` o `null`

## Architettura: modalità batch Excel

### `excel-processor.js` — tre oggetti globali

**`ExcelParser`**
- `parse(arrayBuffer)` → `{ docRows, scansByUnit, totalScans }`
- Usa SheetJS (`XLSX.read`).
- Rileva automaticamente la riga di intestazione (Strategia 1: cerca il
  marcatore "RIGA DI ESEMPIO"; Strategia 2: riga con più celle significative).
- Normalizza i nomi colonna (`normalizeCol`): gestisce sia il formato
  snake_case del vecchio `MetadatiObbligatori_v2.xlsx` sia le intestazioni
  display multiriga del nuovo `Modello_MetadatiScansioni.xlsx`.

**`ExcelMETSGenerator`**
- `generate(docRow, scanRows)` → stringa XML METS ECO-MiC 1.2 completo.
- Mappa i campi Excel alle sezioni METS: `metsHdr`, `dmdSec` (MODS),
  `amdSec` (techMD NISO-MIX + rightsMD METSRIGHTS + rightsMD DCT), `fileSec`,
  `structMap`.
- **Nota schema MIX:** `mix:IccProfile` è intenzionalmente omesso da
  `ImageColorEncoding` perché il validatore Cineca lo rifiuta quando non
  preceduto da `extraSamples/Colormap/GrayResponse/WhitePoint/PrimaryChromaticities`.
  Il campo `icc_profile_name` resta documentato nell'Excel ma non mappato nel MIX.
- `CREATEDATE` nel `metsHdr` viene sempre prodotto in formato `xs:dateTime`
  (aggiunge `T00:00:00` se il valore Excel è solo una data).

**`ExcelBatchProcessor`**
- `run(docRows, scansByUnit, rootDirHandle, options, onProgress, stopRef)`
  → elabora le unità una alla volta (no accumulo in RAM).
- `buildFolderMap(rootDirHandle)`: mappa le cartelle delle unità in un
  unico passaggio (supporta struttura piatta e annidata).
- `getCheckpoint()` / `saveCheckpoint()` / `clearCheckpoint()`: persistenza
  in `localStorage` (chiave `filza_batch_checkpoint`).
- `stopRef.current = true` per sospendere il ciclo tra un'unità e l'altra.
- Il checkpoint viene cancellato automaticamente se il batch completa senza
  interruzioni.

### `app.js` — due componenti React principali

**`ExcelImportTab`**: gestisce il flusso batch completo.
- Fasi: `idle → ready → running → paused/done`
- `ExcelFileDropZone`: dropzone per file `.xlsx`
- `BatchProgressTable`: tabella con progress bar, badge validazione
  cliccabili (espandono gli errori ECO-MiC), contatori riepilogativi
- `handleExportCsv()`: esporta log CSV con BOM UTF-8 (aperto correttamente
  da Excel in italiano)

**`AppWithExcel`**: shell dell'applicazione con 4 tab:
- **Importa da Excel** (default)
- **Genera METS (singolo)** — flusso interattivo originale
- **Gestione Archivi** — configurazione enti in localStorage
- **Log** — log operazioni

## Nota su `mods:recordContentSource`

Il campo richiede un **codice registrato in ECO-MiC/ICDP** (es. `SAN`, `SBN`,
`SIGECWEB`). Valori non registrati causano errore di validazione Cineca. Se il
campo è vuoto nell'Excel, l'elemento `mods:recordInfo` viene omesso (ma il
validatore Cineca potrebbe segnalarlo come mancante). L'istituzione deve
contattare ICDP per il codice corretto.

## Compatibilità Excel

Il parser rileva automaticamente due formati:
- **Nuovo** `Modello_MetadatiScansioni.xlsx`: intestazioni display multiriga
  (es. `"CODICE\nISTITUTO"`), riga legenda, riga gruppi, riga esempio.
- **Vecchio** `MetadatiObbligatori_v2.xlsx`: intestazioni snake_case in riga 0,
  colonna `codice_oggetto` assente nelle Scansioni (assegnazione automatica
  se c'è solo una unità documentaria).

## Launcher Windows

`avvia_filza.bat`:
1. Controlla se la porta 8080 è già in uso.
2. Prova Python (`python` / `py`) → server in finestra minimizzata.
3. Fallback: PowerShell (`filza_server.ps1`) → server HTTP puro senza dipendenze.
4. Apre Edge → Chrome → browser predefinito su `http://localhost:8080`.

## Test sample

Cartella di test PND-conforme: `../test_sample/IT-RMB576/IT-RMB576+PFR2_4/`
- 12 scansioni × 3 formati (DNG/TIFF/JPG) + ICC + log.
- Excel: `MetadatiObbligatori_v2.xlsx` (vecchio formato, compatibile).
- Excel nuovo formato: `../../Modello_MetadatiScansioni.xlsx`.

Per testare la validazione Cineca: avvia `python3 -m http.server 8080`,
carica l'Excel nel tab "Importa da Excel", abilita la validazione.

## Roadmap — non ancora implementato

- [ ] Estrazione automatica EXIF/MIX dai file (libreria `exifr` via CDN)
- [ ] Export ZIP completo (JSZip via CDN)
- [ ] Modalità "file sciolti": smistamento automatico in `dng/tiff/jpg/`
- [ ] Label recto/verso editabile per singola scansione nel tab interattivo
- [ ] Validatore locale Schematron-like come fallback offline

## Standard di riferimento

- ECO-MiC 1.2: https://github.com/icdp-digital-library/profilo-mets-ecomic
- ICDP-PND: https://docs.italia.it/italia/icdp/icdp-pnd-digitalizzazione-docs/
- API Cineca: https://validavmetsecomic.prod.os01.ocp.cineca.it/api/v1/checkmetsecomic
