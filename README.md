# Filza

**Generatore METS ECO-MiC per archivi storici digitalizzati.**

Filza è un'applicazione web standalone che produce metadati METS conformi al
profilo **ECO-MiC 1.2** (Istituto centrale per la digitalizzazione del
patrimonio culturale - MiC) a partire da cartelle di scansioni organizzate
secondo le linee guida ICDP-PND.

Non richiede backend, build step, server applicativo. Tutto gira nel browser.

## Convenzione cartelle attesa

Filza riconosce due convenzioni:

### Convenzione PND/ECO-MiC (raccomandata)

```
<CodiceIstituto>+<CodiceOggetto>/        ← es. IT-RMB576+PFR2_4/
├── dng/                                 ← master RAW       → fileGrp USE="ARCHIVE"
│   └── IT-RMB576+PFR2_4+00001.dng       ← 5 cifre pure
├── tiff/                                ← master TIFF      → fileGrp USE="SERVICE"
│   └── IT-RMB576+PFR2_4+00001.tif
├── jpg/                                 ← derivati JPEG    → fileGrp USE="HIGH"
│   └── IT-RMB576+PFR2_4+00001.jpg
├── icc/                                 ← profili colore   → fileGrp USE="STORAGE"
│   └── AdobeRGB1998.icc
├── logs/                                ← log scansione    (ignorato in fileSec)
│   └── scan_log.txt
└── mets/                                ← output Filza     (ignorato in fileSec)
    └── METS_IT-RMB576+PFR2_4.xml
```

Riferimento: [Linee guida ICDP-PND, *Nomenclatura degli oggetti digitali*](https://docs.italia.it/italia/icdp/icdp-pnd-digitalizzazione-docs/).

### Convenzione Archivia Lite (legacy, supportata)

```
<numero>/                                ← es. 0001/
├── master/                              ← DNG/RAW          → ARCHIVE
├── calibrato/                           ← TIFF             → SERVICE
├── derivato/                            ← JPEG             → HIGH
└── icc/                                 ← profili colore   → STORAGE
```

In entrambi i casi il `USE` METS è determinato in priorità dall'**estensione**
del file (più affidabile del nome cartella), con fallback al nome cartella.

## Nomenclatura dei file

PND/ICDP:

```
<CodiceIstituto>+<CodiceOggetto>+<NumeroProgressivo>.<estensione>
```

- `CodiceIstituto`: codice ISIL / ISTAT / SBN / RISM dell'istituto (senza spazi
  né "+").
- `CodiceOggetto`: identificativo univoco dell'unità documentaria (senza spazi
  né "+").
- `NumeroProgressivo`: **5 cifre numeriche** con zero padding (fino a 99 999
  file per oggetto).

Esempio: `IT-RMB576+PFR2_4+00001.tif`.

Filza legge il `NumeroProgressivo` direttamente dal nome del file: se i file
sono già nominati correttamente vengono ordinati in base al loro progressivo,
non riscritti. Solo se il nome non è conforme Filza rinumera per posizione
nell'array (anche in quel caso a 5 cifre).

L'informazione **recto/verso** non sta nel nome file (per essere PND-strict):
sta nei metadati METS (`structMap`, attributo `LABEL`) e nel foglio
`Scansioni` del file Excel descrittivo (campi `label` e `lato`).

## Requisiti

- Browser moderno: **Chrome 86+, Edge 86+**. Su Firefox/Safari funziona solo
  l'import per drag&drop (no `showDirectoryPicker`).
- Connessione internet solo per la validazione tramite l'API Cineca.

## Avvio

```bash
# Con Python
python -m http.server 8080

# Con Node.js
npx serve .

# Oppure aprendo direttamente index.html (alcune funzioni richiedono http://)
```

Poi aprire `http://localhost:8080`.

## Workflow

1. **Configura un Ente**: codice ISIL/ISTAT/SBN/RISM, nome dell'archivio,
   diritti, attrezzatura. I dati restano in `localStorage`.
2. **Trascina la cartella PND** (`IT-RMB576+PFR2_4/`). Filza riconosce
   automaticamente codice istituto e codice oggetto dal nome cartella.
3. **Compila i metadati**: titolo, descrizione, datazione, ecc. (oppure importa
   il file Excel `MetadatiObbligatori_v2.xlsx`).
4. **Valida** contro l'API Cineca METS ECO-MiC.
5. **Esporta** l'XML, oppure scarica uno ZIP completo (XML + scansioni +
   log + checksum).

## Struttura XML prodotto

Schema METS ECO-MiC 1.2:

- `metsHdr` con tre `agent` obbligatori: CREATOR, CUSTODIAN, IPOWNER.
- `dmdSec` MODS: identificatori (logicalId, conservativeId, conservativeIdAuthority,
  relationId), typeOfResource, titleInfo, abstract, name (Soggetto Produttore +
  Soggetto Conservatore), originInfo, physicalDescription, location, relatedItem.
- `amdSec` con `techMD` NISO-MIX per ogni file, `rightsMD` METSRIGHTS e DC.
- `fileSec` strutturato nidificato: `INTERNAL > TEXT > [ARCHIVE | SERVICE | HIGH | STORAGE]`.
- `structMap TYPE="PHYSICAL"` con `div TYPE="FOLDER"` e `div TYPE="FILE"` per
  ogni scansione (con `LABEL`, `ORDER`, `ID`).

## Mappatura cartella → fileGrp `USE`

| Estensione file | Cartella PND | Cartella Archivia | `USE` METS |
|-----------------|--------------|-------------------|------------|
| `.dng`, `.raw`  | `dng/`       | `master/`         | `ARCHIVE`  |
| `.tif`, `.tiff` | `tiff/`      | `calibrato/`      | `SERVICE`  |
| `.jpg`, `.jpeg`, `.png` | `jpg/` | `derivato/`     | `HIGH`     |
| `.icc`, `.icm`  | `icc/`       | `icc/`            | `STORAGE`  |

Cartelle `logs/`, `mets/`, `log/`, `metadata/` sono ignorate (non finiscono in
fileSec — i file in `mets/` sono output di Filza, non input).

## Differenze rispetto ad Archivia Lite

- **Nome software** centralizzato in `app.js` (`APP_NAME`, `APP_VERSION`).
- **Parsing nome cartella PND** (`METSGenerator.parseFolderName`): se la cartella
  si chiama `IT-XX+OGGETTO`, codice istituto e codice oggetto sono presi
  automaticamente.
- **Parsing nome file PND** (`METSGenerator.parseFileName`): il numero
  progressivo viene letto dal nome del file (5 cifre), non rigenerato per
  posizione. Tollera anche il formato legacy `0001r`/`0002v`.
- **Mapping USE per estensione**, indipendente dal nome cartella.
- **Padding a 5 cifre** (era 4) come prescritto dalle linee guida PND.
- Categorie cartelle estese: `dng/`, `tiff/`, `jpg/` riconosciute oltre alle
  legacy `master/`, `calibrato/`, `derivato/`.

## Limiti noti

- Import/export Excel non ancora implementato (in roadmap, vedi
  `MetadatiObbligatori_v2.xlsx` come schema target).
- Estrazione automatica EXIF/MIX dai file: oggi i campi MIX vengono dai default
  dell'entità configurata, non dal file stesso (libreria `exifr` in roadmap).
- L'export ZIP della cartella completa è in roadmap; oggi esporta solo XML.
- L'API Cineca di validazione può essere bloccata da CORS in alcuni contesti.

## Riferimenti

- [Profilo METS ECO-MiC 1.2 (ICDP-MiC)](https://github.com/icdp-digital-library/profilo-mets-ecomic)
- [Linee guida ICDP-PND per la digitalizzazione](https://docs.italia.it/italia/icdp/icdp-pnd-digitalizzazione-docs/)
- [METS standard (LoC)](http://www.loc.gov/standards/mets/)
- [MODS standard (LoC)](http://www.loc.gov/standards/mods/)
- [MIX standard (LoC)](http://www.loc.gov/standards/mix/)
- [METSRIGHTS schema (Stanford)](https://www.loc.gov/standards/rights/METSRights.xsd)

## Licenza

EUPL 1.2.

## Storia

Filza è una nuova versione di [archivia-lite](https://github.com/...) (Archivia
Project), riallineata alle linee guida ICDP-PND per la nomenclatura degli
oggetti digitali e al profilo METS ECO-MiC 1.2.
