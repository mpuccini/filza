# CLAUDE.md

Istruzioni per Claude Code (claude.ai/code) e altri agenti AI che lavorano
in questo repository.

## Project Overview

Filza è una webapp standalone (zero backend, zero build step) che genera
metadati METS ECO-MiC 1.2 a partire da cartelle di scansioni archivistiche
organizzate secondo le linee guida ICDP-PND.

**Stack:** HTML + JS vanilla + React via CDN + `htm` (template literal JSX).

## File layout

```
filza/
├── index.html              # Entry point, importa script via CDN
├── styles.css              # Stili
├── app.js                  # UI React + lettura cartelle + checksum
├── mets-generator.js       # Generatore XML METS ECO-MiC 1.2
├── api-validator.js        # Client API Cineca di validazione
├── README.md               # Documentazione utente
└── CLAUDE.md               # Questo file
```

## Convenzioni nomenclatura PND

**Critico**: la nomenclatura PND/ICDP è il cuore del software. Ogni modifica
a parser o file naming deve mantenere conformità con:

> `<CodiceIstituto>+<CodiceOggetto>+<NumeroProgressivo>.<estensione>`

Vincoli:
- `+` come unico separatore di alto livello (vietato dentro i Codici).
- `NumeroProgressivo` a **5 cifre numeriche** con zero padding.
- Niente suffisso r/v nel nome file (recto/verso vive nei metadati METS LABEL).

I parser autoritativi vivono in `mets-generator.js`:
- `METSGenerator.parseFolderName(name)` → `{codiceIstituto, codiceOggetto}` o `null`.
- `METSGenerator.parseFileName(name)` → `{progressivo, progressivoStr, lato, ext}` o `null`.

## Decisioni architetturali

### USE METS deciso per estensione, non per nome cartella

`extensionToUse` (in `mets-generator.js`) ha priorità su `folderToUse`. Questo
permette di gestire cartelle organizzate sia secondo la convenzione PND
(`dng/`, `tiff/`, `jpg/`) sia legacy Archivia Lite (`master/`, `calibrato/`,
`derivato/`) senza condizionali sparsi.

### Retrocompatibilità Archivia Lite

`classifyFolder()` in `app.js` riconosce entrambe le convenzioni (PND + legacy).
La struttura interna `folderStructure[]` è un oggetto con chiavi dinamiche
(non più fissate a `{master, calibrato, derivato, icc}`), così convivono
cartelle eterogenee.

### Pre-popolamento da nome cartella

`handleFolderLoaded` (in `app.js`) chiama `METSGenerator.parseFolderName` sul
nome della cartella appena trascinata. Se il nome è PND-conforme, popola
automaticamente `documentMetadata.codiceIstituto`, `codiceOggetto`, `logicalId`.

### Progressivo letto dal nome file

`_buildFileInventory` in `mets-generator.js`:
1. Prova a parsare il nome del file con `parseFileName`.
2. Se parsing OK → usa quel progressivo (a 5 cifre).
3. Se parsing fallisce → rinumera per posizione nell'array (`idx + 1`).

Questo evita di sovrascrivere numerazioni archivistiche già stabilite quando
le scansioni sono già nominate correttamente.

## Vincoli da rispettare

- **No build step.** Tutto deve girare aprendo `index.html` o servendolo
  staticamente. Niente webpack, niente npm install. Le dipendenze esterne sono
  via CDN.
- **No backend.** Tutta la persistenza in `localStorage`. I dati sensibili
  (configurazioni enti) restano sul browser dell'utente.
- **Compatibilità Chrome/Edge** come primary target (File System Access API).
  Su altri browser deve degradare a drag&drop con `webkitGetAsEntry`.
- **METS valido**: ogni cambio al generatore deve essere testato contro l'API
  Cineca (`api-validator.js`).

## Test sample

Una cartella di test PND-conforme è in
`../test_sample/IT-RMB576/IT-RMB576+PFR2_4/`:
- 12 scansioni × 3 formati (DNG/TIFF/JPG) + ICC + log + cartella mets vuota.
- File Excel descrittivo: `MetadatiObbligatori_v2.xlsx` con schema
  "una riga per scansione" + "una riga per documento".

Per testare manualmente: avvia un server statico (`python -m http.server`),
trascina `test_sample/IT-RMB576/IT-RMB576+PFR2_4/` nella dropzone. Verifica
che codice istituto e codice oggetto siano pre-popolati e che i progressivi
01-12 siano letti dai nomi file.

## Roadmap

Fix prioritari già applicati:
- [x] Rebrand Filza
- [x] Parser nome cartella PND
- [x] Parser nome file PND (5 cifre, tollerante a r/v legacy)
- [x] Mapping USE per estensione
- [x] Pre-popolamento metadati da nome cartella

Non ancora implementato:
- [ ] Import/export Excel (SheetJS via CDN)
- [ ] Estrazione EXIF/MIX automatica dai file (`exifr` via CDN)
- [ ] Export ZIP completo (JSZip via CDN)
- [ ] Modalità "file sciolti": drag&drop di file non organizzati con
      smistamento automatico in dng/tiff/jpg/
- [ ] Label per scansione (r/v) editabile in UI e propagata in structMap
- [ ] Validatore locale (Schematron-like) come fallback per CORS

## Standard di riferimento

- ICDP-PND Linee guida digitalizzazione:
  https://docs.italia.it/italia/icdp/icdp-pnd-digitalizzazione-docs/
- Profilo METS ECO-MiC 1.2 (PDF + XSD + esempi):
  https://github.com/icdp-digital-library/profilo-mets-ecomic
- API Cineca di validazione:
  https://validavmetsecomic.prod.os01.ocp.cineca.it/api/v1/checkmetsecomic
