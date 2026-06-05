# Filza

**Generatore METS ECO-MiC 1.2 per archivi storici digitalizzati.**

Filza è un'applicazione web standalone che produce metadati METS conformi al
profilo **ECO-MiC 1.2** (Istituto centrale per la digitalizzazione del
patrimonio culturale — MiC) a partire da un foglio Excel compilato dagli
archivisti o da cartelle di scansioni organizzate secondo le linee guida ICDP-PND.

**Zero backend. Zero build step. Zero installazioni.** Tutto gira nel browser.

---

## Avvio

### Windows (archivisti)
Doppio clic su `avvia_filza.bat`. Si avvia automaticamente un server locale e
si apre Microsoft Edge. Vedi `GUIDA_UTENTE.txt` per le istruzioni passo-passo.

### Sviluppo / macOS / Linux
```bash
cd filza/
python3 -m http.server 8080
# poi apri http://localhost:8080 in Chrome o Edge
```

> **Browser richiesto:** Chrome 86+ o Edge 86+.  
> Firefox non supporta la File System Access API (selezione cartelle e scrittura XML su disco).

---

## Modalità di utilizzo

### 1 · Importa da Excel (batch, raccomandata)
Flusso principale per campagne di digitalizzazione multi-documento:

1. Gli archivisti compilano il file `Modello_MetadatiScansioni.xlsx`
   (fogli **Documento** + **Scansioni**) con i metadati di ogni unità documentaria.
2. In Filza: tab **Importa da Excel** → trascina l'Excel → seleziona la cartella
   root delle scansioni → avvia l'elaborazione.
3. Per ogni unità documentaria viene generato e scritto su disco:
   `<CodIst>+<CodOgg>/mets/<CodIst>+<CodOgg>.xml`
4. Ogni XML può essere validato automaticamente contro l'API Cineca ECO-MiC.
5. Al termine: esporta il log CSV con stato e risultati di validazione.

**Checkpoint automatico:** se il processo viene interrotto, Filza riprende
dall'ultima unità elaborata.

**Struttura cartelle attesa:**
```
root/
├── Modello_MetadatiScansioni.xlsx
├── IT-RMB576+PFR2_4/           ← <CodIst>+<CodOgg>
│   ├── dng/
│   ├── tiff/
│   ├── jpg/
│   └── mets/                   ← creata da Filza
│       └── IT-RMB576+PFR2_4.xml
└── IT-RMB576+PFR2_5/
    └── ...
```

Supporta anche strutture annidate (`root/<CodIst>/<CodIst>+<CodOgg>/`).

### 2 · Singola cartella (interattiva)
Per generare o ispezionare il METS di una singola unità documentaria:

1. Tab **Genera METS (singolo)** → configura un Ente in **Gestione Archivi**.
2. Trascina la cartella `<CodIst>+<CodOgg>/` nella dropzone.
3. Filza pre-popola codice istituto e codice oggetto dal nome cartella.
4. Compila i metadati, visualizza il preview XML, valida, esporta.

---

## Struttura cartelle e nomenclatura PND

### Convenzione PND/ECO-MiC (raccomandata)

```
<CodIst>+<CodOgg>/            es. IT-RMB576+PFR2_4/
├── dng/                      master RAW         → fileGrp USE="ARCHIVE"
├── tiff/                     master TIFF        → fileGrp USE="SERVICE"
├── jpg/                      derivati JPEG      → fileGrp USE="HIGH"
├── icc/                      profili colore     → fileGrp USE="STORAGE"
├── logs/                     log scansione      (ignorato in fileSec)
└── mets/                     output Filza       (ignorato in fileSec)
```

### Convenzione Archivia Lite (legacy, supportata)

```
<numero>/
├── master/     → ARCHIVE
├── calibrato/  → SERVICE
└── derivato/   → HIGH
```

### Nome file PND

```
<CodiceIstituto>+<CodiceOggetto>+<NumeroProgressivo>.<estensione>
```

- `NumeroProgressivo`: **5 cifre** con zero padding (`00001`–`99999`).
- Recto/verso: non nel nome file. Vive nei metadati METS (`structMap LABEL`)
  e nel foglio Excel (`label`, `lato`).
- Il `USE` METS è determinato dall'**estensione** del file (priorità) con
  fallback al nome cartella.

---

## Struttura dell'XML prodotto

Schema METS ECO-MiC 1.2:

| Sezione | Contenuto |
|---------|-----------|
| `metsHdr` | CREATOR (responsabile digitalizzazione), CUSTODIAN (ente conservatore), IPOWNER |
| `dmdSec` (MODS) | logicalId, conservativeId, relationId, typeOfResource, titleInfo, abstract, name (Soggetto Produttore + Conservatore), originInfo, physicalDescription, language, location, relatedItem (fondo, serie) |
| `amdSec` | `techMD` NISO-MIX per ogni file (scanner, DPI, bit depth, color space, data scansione); `rightsMD` METSRIGHTS; `rightsMD` DCT (license + rights) |
| `fileSec` | `INTERNAL > TEXT > [ARCHIVE \| SERVICE \| HIGH \| STORAGE]` |
| `structMap` | TYPE="PHYSICAL", `div TYPE="FOLDER"` con `div TYPE="FILE"` (LABEL, ORDER, ID) per ogni scansione |

---

## Note sul campo `mods:recordContentSource`

Il campo `record_content_source` nell'Excel deve contenere un **codice registrato
in ECO-MiC/ICDP** (es. `SAN`, `SBN`, `SIGECWEB`). Valori non registrati
causano un errore di validazione Cineca. Contattare ICDP per il codice corretto.

---

## File

```
filza/
├── index.html              Entry point (carica CDN + script locali)
├── css/
│   └── styles.css          Stili
├── js/
│   ├── app.js              UI React (entrambi i tab)
│   ├── mets-generator.js   Generatore METS da struttura cartelle
│   ├── excel-processor.js  Parser Excel (SheetJS) + generatore METS batch
│   └── api-validator.js    Client API Cineca
├── avvia_filza.bat         Launcher Windows (avvia server + Edge)
├── filza_server.ps1        Server HTTP PowerShell
├── GUIDA_UTENTE.txt        Guida per archivisti non tecnici
├── README.md               Questo file
└── CLAUDE.md               Istruzioni per agenti AI
```

**Stack:** HTML + JS vanilla + React 18 via CDN + `htm` (JSX senza Babel) +
SheetJS 0.20 via CDN per la lettura Excel.

---

## Dipendenze CDN

| Libreria | Versione | Uso |
|----------|----------|-----|
| React + ReactDOM | 18 | UI |
| htm | 3 | Template literals JSX-like |
| SheetJS (xlsx) | 0.20.3 | Lettura file `.xlsx` |

Nessuna dipendenza npm. Nessun build step.

---

## Riferimenti standard

- [Profilo METS ECO-MiC 1.2 (ICDP-MiC)](https://github.com/icdp-digital-library/profilo-mets-ecomic)
- [Linee guida ICDP-PND digitalizzazione](https://docs.italia.it/italia/icdp/icdp-pnd-digitalizzazione-docs/)
- [API validazione Cineca](https://validavmetsecomic.prod.os01.ocp.cineca.it/api/v1/checkmetsecomic)
- [METS (LoC)](http://www.loc.gov/standards/mets/) · [MODS (LoC)](http://www.loc.gov/standards/mods/) · [MIX (LoC)](http://www.loc.gov/standards/mix/)

---

## Licenza

EUPL 1.2
