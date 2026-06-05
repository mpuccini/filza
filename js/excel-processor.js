/**
 * excel-processor.js
 * Filza — modalità "Importa da Excel"
 *
 * Contiene:
 *  - ExcelParser       : legge SheetJS workbook → docRows + scansByUnit
 *  - ExcelMETSGenerator: genera XML METS ECO-MiC 1.2 da riga Excel (niente FS)
 *  - ExcelBatchProcessor: elabora tutte le unità con checkpoint localStorage
 *
 * Dipendenze CDN: XLSX (SheetJS), METSValidator (api-validator.js)
 */

// ── Costanti ───────────────────────────────────────────────────────────────────
var EMETS_NS = {
    mets:       'http://www.loc.gov/METS/',
    mods:       'http://www.loc.gov/mods/v3',
    mix:        'http://www.loc.gov/mix/v20',
    dct:        'http://purl.org/dc/terms/',
    metsrights: 'http://cosimo.stanford.edu/sdr/metsrights/',
    xlink:      'http://www.w3.org/1999/xlink',
    xsi:        'http://www.w3.org/2001/XMLSchema-instance'
};
var EMETS_SCHEMA_LOC = [
    'http://www.loc.gov/METS/ http://www.loc.gov/standards/mets/mets.xsd',
    'http://www.loc.gov/mix/v20 http://www.loc.gov/standards/mix/mix20/mix20.xsd',
    'http://www.loc.gov/mods/v3 http://www.loc.gov/mods/v3/mods-3-7.xsd',
    'http://cosimo.stanford.edu/sdr/metsrights/ https://www.loc.gov/standards/rights/METSRights.xsd'
].join(' ');

var EMETS_MIME = { dng:'image/x-adobe-dng', tif:'image/tiff', tiff:'image/tiff', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png' };
var EMETS_FMT  = { dng:'DNG', tif:'TIFF', tiff:'TIFF', jpg:'JPEG', jpeg:'JPEG', png:'PNG' };
var EMETS_USE  = { dng:'ARCHIVE', tif:'SERVICE', tiff:'SERVICE', jpg:'HIGH', jpeg:'HIGH', png:'HIGH' };
var EMETS_FOLDER = { dng:'dng', tif:'tiff', tiff:'tiff', jpg:'jpg', jpeg:'jpg' };
var EMETS_COMPRESSION = { 'image/tiff':'Uncompressed', 'image/jpeg':'JPEG', 'image/x-adobe-dng':'Uncompressed', 'image/png':'Deflate' };
var EMETS_BYTEORDER   = { 'image/tiff':'little endian', 'image/jpeg':'big endian', 'image/x-adobe-dng':'little endian', 'image/png':'big endian' };
var EMETS_SPP = { RGB:3, sRGB:3, Grayscale:1, CMYK:4 };

// ── ExcelParser ────────────────────────────────────────────────────────────────

var ExcelParser = (function() {

    // Mappa label display → nome campo snake_case
    var COL_MAP = {
        'codice istituto':'codice_istituto', 'authority istituto':'codice_istituto_authority',
        'codice istituto authority':'codice_istituto_authority', 'codice oggetto':'codice_oggetto',
        'relation id':'relation_id', 'record content source':'record_content_source',
        'type of resource':'type_of_resource', 'tipologia documentaria':'tipologia_documentaria',
        'titolo':'titolo', 'descrizione':'descrizione', 'livello descrizione':'livello_descrizione',
        'soggetto produttore':'soggetto_produttore', 'ente conservatore':'ente_conservatore',
        'email ente conservatore':'ente_conservatore_email', 'ip owner':'ip_owner',
        'localizzazione fisica':'localizzazione_fisica', 'segnatura archivistica':'segnatura_archivistica',
        'fondo':'fondo', 'serie':'serie', 'data inizio':'data_inizio', 'data fine':'data_fine',
        'periodo estremi':'periodo_estremi', 'lingua':'lingua', 'forma fisica':'forma_fisica',
        'estensione fisica':'estensione_fisica', 'rights holder':'rights_holder',
        'rights status':'rights_status', 'license uri':'license_uri',
        'rights context class':'rights_context_class', 'rights context type':'rights_context_type',
        'rights context id':'rights_context_id', 'progetto riferimento':'progetto_riferimento',
        'responsabile digitalizzazione':'responsabile_digitalizzazione',
        'responsabile digitalizzz.':'responsabile_digitalizzazione',
        'data digitalizzazione':'data_digitalizzazione', 'data digit.':'data_digitalizzazione',
        'scanner produttore':'scanner_produttore', 'scanner modello':'scanner_modello',
        'software acquisizione':'software_acquisizione', 'icc profile name':'icc_profile_name',
        'dpi default':'dpi_default', 'bit depth default':'bit_depth_default',
        'color space':'color_space', 'note digitalizzazione':'note_digitalizzazione',
        // Scansioni
        'progressivo':'progressivo', 'label':'label', 'carta n.':'carta_numero',
        'carta numero':'carta_numero', 'lato':'lato', 'tipologia scansione':'tipologia_scansione',
        'titolo pagina':'titolo_pagina', 'data scansione':'data_scansione',
        'trascrizione':'trascrizione', 'note pagina':'note_pagina',
        'dpi':'dpi', 'bit depth':'bit_depth',
        'file master dng':'file_master_dng', 'file calibrato tif':'file_calibrato_tif',
        'file tif':'file_calibrato_tif', 'file derivato jpg':'file_derivato_jpg',
        'file jpg':'file_derivato_jpg'
    };

    function normalizeCol(raw) {
        if (!raw && raw !== 0) return null;
        var s = String(raw).trim();
        if (!s || s === 'nan' || s === 'None') return null;

        // Già snake_case (vecchio formato) → restituisci direttamente
        if (/^[a-z][a-z0-9_]*$/.test(s)) return s;

        // Pulisce un testo: lowercase, rimuove note tra () e [], frecce, normalizza spazi
        function clean(t) {
            return t.toLowerCase()
                .replace(/\s*\(.*?\)/g, '')    // rimuovi (note tra parentesi)
                .replace(/\s*\[.*?\]/g, '')    // rimuovi [note tra parentesi quadre]
                .replace(/\s*←[^\n]*/g, '')    // rimuovi ← e testo sulla stessa riga
                .replace(/\s*↓[^\n]*/g, '')    // rimuovi ↓ e testo sulla stessa riga
                .replace(/\n+/g, ' ')          // newline → spazio (unisce le righe)
                .replace(/\s+/g, ' ').trim();
        }

        // 1. Prova l'intera stringa con tutte le righe unite
        //    Es. "CODICE\nISTITUTO" → "codice istituto" → "codice_istituto"
        var full = clean(s);
        if (COL_MAP[full]) return COL_MAP[full];

        // 2. Prova solo la prima riga (gestisce "LATO\nR / V / -" → "lato")
        var firstLine = clean(s.split('\n')[0]);
        if (COL_MAP[firstLine]) return COL_MAP[firstLine];

        // 3. Fallback snake_case
        return (full || firstLine).replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || null;
    }

    var SKIP_VALS = /obbligatorio|opzionale|da compilare|esempio|↓|←/i;

    function findHeaderRow(rows) {
        var SCAN_LIMIT = Math.min(rows.length, 14);

        // Strategia 1 (nuovo template): il marcatore "↓ RIGA DI ESEMPIO"
        // si trova nella riga successiva all'intestazione. Troviamolo e
        // restituiamo la riga precedente.
        for (var i = 1; i < SCAN_LIMIT; i++) {
            for (var j = 0; j < rows[i].length; j++) {
                var s = String(rows[i][j] || '').trim();
                if (/esempio|riga di esempio|↓.*riga/i.test(s)) {
                    return i - 1;   // intestazione = riga precedente il marcatore
                }
            }
        }

        // Strategia 2 (vecchio formato / fallback): riga con più celle
        // significative (le intestazioni sono sempre la riga più densa).
        var bestRow = 0, bestCount = 0;
        for (var i = 0; i < SCAN_LIMIT; i++) {
            var count = 0;
            for (var j = 0; j < rows[i].length; j++) {
                var c = rows[i][j];
                if (!c && c !== 0) continue;
                var s = String(c).trim();
                if (!s || SKIP_VALS.test(s) || /^\d+(\.\d+)?$/.test(s)) continue;
                count++;
            }
            if (count > bestCount) { bestCount = count; bestRow = i; }
        }
        return bestRow;
    }

    function parseSheet(worksheet, keyField) {
        var raw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (!raw || raw.length === 0) return [];
        var hdrIdx = findHeaderRow(raw);
        var hdrRow = raw[hdrIdx];
        var colNames = hdrRow.map(normalizeCol);

        var result = [];
        for (var i = hdrIdx + 1; i < raw.length; i++) {
            var row = raw[i];
            var obj = {};
            colNames.forEach(function(name, j) {
                if (name) obj[name] = (row[j] !== undefined && row[j] !== null) ? String(row[j]).trim() : '';
            });
            var keyVal = obj[keyField] || '';
            if (!keyVal || SKIP_VALS.test(keyVal)) continue;
            result.push(obj);
        }
        return result;
    }

    return {
        /**
         * Legge un ArrayBuffer di file .xlsx e restituisce { docRows, scansByUnit, totalScans }.
         * Lancia eccezione se i fogli obbligatori mancano.
         */
        parse: function(arrayBuffer) {
            if (typeof XLSX === 'undefined') throw new Error('Libreria SheetJS non caricata. Verifica la connessione a internet e ricarica la pagina.');
            var wb = XLSX.read(arrayBuffer, { type: 'array' });

            if (!wb.Sheets['Documento']) throw new Error("Foglio 'Documento' non trovato nell'Excel");
            if (!wb.Sheets['Scansioni']) throw new Error("Foglio 'Scansioni' non trovato nell'Excel");

            var docRows = parseSheet(wb.Sheets['Documento'], 'codice_oggetto');
            var scanRows = parseSheet(wb.Sheets['Scansioni'], 'progressivo');

            // Assicura colonna codice_oggetto nelle scansioni
            scanRows.forEach(function(r) { if (!r.codice_oggetto) r.codice_oggetto = ''; });

            // Raggruppa scansioni per codice_oggetto
            var scansByUnit = {};
            var orphans = [];
            scanRows.forEach(function(r) {
                var key = r.codice_oggetto;
                if (!key) { orphans.push(r); return; }
                if (!scansByUnit[key]) scansByUnit[key] = [];
                scansByUnit[key].push(r);
            });
            // Se tutte le scansioni sono orfane e c'è solo un documento → assegnale
            if (orphans.length > 0 && docRows.length === 1) {
                scansByUnit[docRows[0].codice_oggetto] = orphans;
            }

            return {
                docRows: docRows,
                scansByUnit: scansByUnit,
                totalScans: scanRows.length + (orphans.length > 0 && docRows.length === 1 ? 0 : orphans.length)
            };
        }
    };
})();

// ── ExcelMETSGenerator ─────────────────────────────────────────────────────────

var ExcelMETSGenerator = (function() {

    function v(obj, key, def) {
        if (!obj) return def || '';
        var val = obj[key];
        if (val === undefined || val === null) return def || '';
        var s = String(val).trim();
        return (s === '' || s.toLowerCase() === 'nan' || s.toLowerCase() === 'none') ? (def || '') : s;
    }

    function asInt(s, def) {
        if (s === undefined || s === null || s === '') return def;
        var n = parseInt(String(s).replace(/[^0-9]/g, ''), 10);
        return isNaN(n) ? def : n;
    }

    function esc(s) {
        if (!s) return '';
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    }

    function buildInventory(docRow, scanRows, logicalId) {
        var codIst = v(docRow, 'codice_istituto');
        var codOgg = v(docRow, 'codice_oggetto');
        var files = [];

        scanRows.forEach(function(scan) {
            var progRaw = v(scan, 'progressivo');
            if (!progRaw) return;
            var progInt = parseInt(progRaw, 10);
            if (isNaN(progInt)) return;
            var progStr = String(progInt).padStart(5, '0');

            [
                { field: 'file_master_dng',    ext: 'dng' },
                { field: 'file_calibrato_tif', ext: 'tif' },
                { field: 'file_derivato_jpg',  ext: 'jpg' }
            ].forEach(function(ff) {
                var fname = v(scan, ff.field) || (codIst + '+' + codOgg + '+' + progStr + '.' + ff.ext);
                var ext   = ff.ext;
                var mime  = EMETS_MIME[ext]   || 'application/octet-stream';
                var fmt   = EMETS_FMT[ext]    || ext.toUpperCase();
                var use   = EMETS_USE[ext]    || 'OTHER';
                var folder= EMETS_FOLDER[ext] || ext;

                files.push({
                    name:     fname,
                    ext:      ext,
                    mime:     mime,
                    fmt:      fmt,
                    use:      use,
                    folder:   folder,
                    fileId:   fmt + '_' + logicalId + '_' + progStr,
                    techId:   'TD_' + fmt + '_' + logicalId + '_' + progStr,
                    href:     './' + folder + '/' + fname,
                    prog:     progInt,
                    progStr:  progStr,
                    scanDate: v(scan, 'data_scansione'),
                    dpiOv:    v(scan, 'dpi'),
                    bitsOv:   v(scan, 'bit_depth'),
                    csOv:     v(scan, 'color_space')
                });
            });
        });
        return files;
    }

    // Garantisce formato xs:dateTime (YYYY-MM-DDTHH:MM:SS) richiesto dal METS schema
    function toDateTime(s, fallback) {
        if (!s) return fallback;
        s = s.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00:00';   // date-only → aggiungi orario
        return s;
    }

    function metsHeader(docRow, logicalId, now) {
        var creator  = v(docRow, 'responsabile_digitalizzazione');
        var custodian= v(docRow, 'ente_conservatore');
        var ipOwner  = v(docRow, 'ip_owner');
        var created  = toDateTime(v(docRow, 'data_digitalizzazione'), now);
        return [
            '  <mets:metsHdr ID="HDR_' + esc(logicalId) + '"',
            '    CREATEDATE="' + esc(created) + '" LASTMODDATE="' + now + '" RECORDSTATUS="COMPLETE">',
            '    <mets:agent ROLE="CREATOR" TYPE="INDIVIDUAL"><mets:name>' + esc(creator) + '</mets:name></mets:agent>',
            '    <mets:agent ROLE="CUSTODIAN" TYPE="ORGANIZATION"><mets:name>' + esc(custodian) + '</mets:name></mets:agent>',
            '    <mets:agent ROLE="IPOWNER" TYPE="ORGANIZATION"><mets:name>' + esc(ipOwner) + '</mets:name></mets:agent>',
            '  </mets:metsHdr>'
        ].join('\n');
    }

    function dmdSec(docRow, logicalId) {
        var codIst   = v(docRow, 'codice_istituto');
        var auth     = v(docRow, 'codice_istituto_authority');
        var relId    = v(docRow, 'relation_id', 'representation');
        var src      = v(docRow, 'record_content_source');
        var resType  = v(docRow, 'type_of_resource');
        var tipol    = v(docRow, 'tipologia_documentaria');
        var titolo   = v(docRow, 'titolo');
        var descr    = v(docRow, 'descrizione');
        var produt   = v(docRow, 'soggetto_produttore');
        var conserv  = v(docRow, 'ente_conservatore');
        var luogo    = v(docRow, 'localizzazione_fisica');
        var segnat   = v(docRow, 'segnatura_archivistica');
        var fondo    = v(docRow, 'fondo');
        var serie    = v(docRow, 'serie');
        var dStart   = v(docRow, 'data_inizio');
        var dEnd     = v(docRow, 'data_fine');
        var lingua   = v(docRow, 'lingua');
        var forma    = v(docRow, 'forma_fisica');
        var estens   = v(docRow, 'estensione_fisica');

        var ln = [];
        ln.push('  <mets:dmdSec ID="DMD01" STATUS="complete">');
        ln.push('    <mets:mdWrap MDTYPE="MODS"><mets:xmlData>');
        ln.push('      <mods:mods xmlns:mods="' + EMETS_NS.mods + '">');
        ln.push('        <mods:identifier type="logicalId">' + esc(logicalId) + '</mods:identifier>');
        ln.push('        <mods:identifier type="conservativeId">' + esc(codIst) + '</mods:identifier>');
        if (auth) ln.push('        <mods:identifier type="conservativeIdAuthority">' + esc(auth) + '</mods:identifier>');
        ln.push('        <mods:identifier type="relationId">' + esc(relId) + '</mods:identifier>');
        if (segnat) ln.push('        <mods:identifier type="callNumber">' + esc(segnat) + '</mods:identifier>');
        if (src) { ln.push('        <mods:recordInfo>'); ln.push('          <mods:recordContentSource>' + esc(src) + '</mods:recordContentSource>'); ln.push('        </mods:recordInfo>'); }
        if (resType) ln.push('        <mods:typeOfResource>' + esc(resType) + '</mods:typeOfResource>');
        if (tipol) ln.push('        <mods:genre>' + esc(tipol) + '</mods:genre>');
        if (titolo) { ln.push('        <mods:titleInfo><mods:title>' + esc(titolo) + '</mods:title></mods:titleInfo>'); }
        if (descr) ln.push('        <mods:abstract>' + esc(descr) + '</mods:abstract>');
        if (produt) {
            ln.push('        <mods:name type="corporate"><mods:namePart>' + esc(produt) + '</mods:namePart>');
            ln.push('          <mods:role><mods:roleTerm type="text" authority="IPAC">Soggetto Produttore</mods:roleTerm></mods:role>');
            ln.push('        </mods:name>');
        }
        if (conserv) {
            ln.push('        <mods:name type="corporate"><mods:namePart>' + esc(conserv) + '</mods:namePart>');
            ln.push('          <mods:role><mods:roleTerm type="text" authority="IPAC">Soggetto Conservatore</mods:roleTerm></mods:role>');
            ln.push('        </mods:name>');
        }
        if (dStart || dEnd) {
            ln.push('        <mods:originInfo>');
            if (dStart && dEnd && dStart !== dEnd) {
                ln.push('          <mods:dateCreated point="start">' + esc(dStart) + '</mods:dateCreated>');
                ln.push('          <mods:dateCreated point="end">' + esc(dEnd) + '</mods:dateCreated>');
            } else {
                ln.push('          <mods:dateCreated>' + esc(dStart || dEnd) + '</mods:dateCreated>');
            }
            ln.push('        </mods:originInfo>');
        }
        if (forma || estens) {
            ln.push('        <mods:physicalDescription>');
            if (forma) ln.push('          <mods:form>' + esc(forma) + '</mods:form>');
            if (estens) ln.push('          <mods:extent>' + esc(estens) + '</mods:extent>');
            ln.push('        </mods:physicalDescription>');
        }
        if (lingua) {
            var langCode = lingua.indexOf('-') !== -1 ? lingua.split('-')[0].trim() : lingua.trim();
            ln.push('        <mods:language><mods:languageTerm type="code" authority="iso639-2b">' + esc(langCode) + '</mods:languageTerm></mods:language>');
        }
        if (luogo) ln.push('        <mods:location><mods:physicalLocation type="current">' + esc(luogo) + '</mods:physicalLocation></mods:location>');
        // ECO-MiC: sia fondo che serie usano otherType="collection" (dal Mapping_METS)
        if (fondo) { ln.push('        <mods:relatedItem otherType="collection"><mods:titleInfo><mods:title>' + esc(fondo) + '</mods:title></mods:titleInfo></mods:relatedItem>'); }
        if (serie) { ln.push('        <mods:relatedItem otherType="collection"><mods:titleInfo><mods:title>' + esc(serie) + '</mods:title></mods:titleInfo></mods:relatedItem>'); }
        ln.push('      </mods:mods>');
        ln.push('    </mets:xmlData></mets:mdWrap>');
        ln.push('  </mets:dmdSec>');
        return ln.join('\n');
    }

    function amdSec(docRow, inventory) {
        var dpiDef  = asInt(v(docRow, 'dpi_default'), 600);
        var bitsDef = asInt(v(docRow, 'bit_depth_default'), 8);
        var csDef   = v(docRow, 'color_space', 'RGB');
        var icc     = v(docRow, 'icc_profile_name');
        var scanProd= v(docRow, 'scanner_produttore');
        var scanMod = v(docRow, 'scanner_modello');
        var software= v(docRow, 'software_acquisizione');
        var creator = v(docRow, 'responsabile_digitalizzazione');
        var codIst  = v(docRow, 'codice_istituto');
        var conserv = v(docRow, 'ente_conservatore');
        var email   = v(docRow, 'ente_conservatore_email');
        var rightH  = v(docRow, 'rights_holder');
        var rightS  = v(docRow, 'rights_status');
        var licUri  = v(docRow, 'license_uri');
        var ctxCls  = v(docRow, 'rights_context_class', 'OTHER');
        var ctxTyp  = v(docRow, 'rights_context_type', 'Standard-IPAC');
        var ctxId   = v(docRow, 'rights_context_id', 'IPAC-PDP-001');

        var ln = ['  <mets:amdSec ID="AMD1">'];

        // ── techMD per file ──────────────────────────────────────────────────
        inventory.forEach(function(f) {
            var dpi  = asInt(f.dpiOv,  dpiDef);
            var bits = asInt(f.bitsOv, bitsDef);
            var cs   = f.csOv || csDef;
            var spp  = EMETS_SPP[cs] || 3;
            var comp = EMETS_COMPRESSION[f.mime] || 'Unknown';
            var bo   = EMETS_BYTEORDER[f.mime]   || 'big endian';

            ln.push('    <mets:techMD ID="' + f.techId + '">');
            ln.push('      <mets:mdWrap MDTYPE="NISOIMG"><mets:xmlData>');
            ln.push('        <mix:mix xmlns:mix="' + EMETS_NS.mix + '" xsi:schemaLocation="' + EMETS_NS.mix + ' http://www.loc.gov/standards/mix/mix20/mix20.xsd">');
            ln.push('          <mix:BasicDigitalObjectInformation>');
            ln.push('            <mix:ObjectIdentifier><mix:objectIdentifierType>local</mix:objectIdentifierType><mix:objectIdentifierValue>' + esc(f.name) + '</mix:objectIdentifierValue></mix:ObjectIdentifier>');
            ln.push('            <mix:FormatDesignation><mix:formatName>' + esc(f.mime) + '</mix:formatName></mix:FormatDesignation>');
            ln.push('            <mix:byteOrder>' + bo + '</mix:byteOrder>');
            ln.push('            <mix:Compression><mix:compressionScheme>' + comp + '</mix:compressionScheme></mix:Compression>');
            ln.push('          </mix:BasicDigitalObjectInformation>');
            ln.push('          <mix:ImageCaptureMetadata>');
            if (creator || f.scanDate) {
                ln.push('            <mix:GeneralCaptureInformation>');
                if (creator)    ln.push('              <mix:imageProducer>' + esc(creator) + '</mix:imageProducer>');
                if (f.scanDate) ln.push('              <mix:dateTimeCreated>' + esc(f.scanDate) + '</mix:dateTimeCreated>');
                ln.push('            </mix:GeneralCaptureInformation>');
            }
            if (scanProd || scanMod || software) {
                ln.push('            <mix:ScannerCapture>');
                if (scanProd) ln.push('              <mix:scannerManufacturer>' + esc(scanProd) + '</mix:scannerManufacturer>');
                if (scanMod)  { ln.push('              <mix:ScannerModel><mix:scannerModelName>' + esc(scanMod) + '</mix:scannerModelName></mix:ScannerModel>'); }
                if (software) { ln.push('              <mix:ScanningSystemSoftware><mix:scanningSoftwareName>' + esc(software) + '</mix:scanningSoftwareName></mix:ScanningSystemSoftware>'); }
                ln.push('            </mix:ScannerCapture>');
            }
            ln.push('          </mix:ImageCaptureMetadata>');
            ln.push('          <mix:ImageAssessmentMetadata>');
            ln.push('            <mix:SpatialMetrics>');
            ln.push('              <mix:samplingFrequencyUnit>in.</mix:samplingFrequencyUnit>');
            ln.push('              <mix:xSamplingFrequency><mix:numerator>' + dpi + '</mix:numerator></mix:xSamplingFrequency>');
            ln.push('              <mix:ySamplingFrequency><mix:numerator>' + dpi + '</mix:numerator></mix:ySamplingFrequency>');
            ln.push('            </mix:SpatialMetrics>');
            ln.push('            <mix:ImageColorEncoding>');
            ln.push('              <mix:BitsPerSample>');
            for (var c = 0; c < spp; c++) ln.push('                <mix:bitsPerSampleValue>' + bits + '</mix:bitsPerSampleValue>');
            ln.push('                <mix:bitsPerSampleUnit>integer</mix:bitsPerSampleUnit>');
            ln.push('              </mix:BitsPerSample>');
            ln.push('              <mix:samplesPerPixel>' + spp + '</mix:samplesPerPixel>');
            // IccProfile omesso: il validatore ECO-MiC (Cineca) richiede elementi
            // intermedi (extraSamples/Colormap/GrayResponse/WhitePoint/PrimaryChromaticities)
            // prima di IccProfile. Il campo icc_profile_name è documentato nell'Excel
            // ma non mappato nel MIX per evitare errori di schema.
            ln.push('            </mix:ImageColorEncoding>');
            ln.push('          </mix:ImageAssessmentMetadata>');
            ln.push('        </mix:mix>');
            ln.push('      </mets:xmlData></mets:mdWrap>');
            ln.push('    </mets:techMD>');
        });

        // ── rightsMD METSRIGHTS ──────────────────────────────────────────────
        ln.push('    <mets:rightsMD ID="BCS">');
        ln.push('      <mets:mdWrap LABEL="Rights Metadata" MDTYPE="METSRIGHTS" MIMETYPE="text/xml"><mets:xmlData>');
        ln.push('        <metsrights:RightsDeclarationMD xmlns:metsrights="' + EMETS_NS.metsrights + '">');
        if (rightH) {
            ln.push('          <metsrights:RightsHolder RIGHTSHOLDERID="' + esc(codIst || 'UNKNOWN') + '">');
            ln.push('            <metsrights:RightsHolderName>' + esc(rightH) + '</metsrights:RightsHolderName>');
            ln.push('          </metsrights:RightsHolder>');
        }
        if (conserv) {
            ln.push('          <metsrights:RightsHolder RIGHTSHOLDERID="' + esc(codIst || 'UNKNOWN') + '_ARCH">');
            ln.push('            <metsrights:RightsHolderName>' + esc(conserv) + '</metsrights:RightsHolderName>');
            if (email) { ln.push('            <metsrights:RightsHolderContact><metsrights:RightsHolderContactEmail>' + esc(email) + '</metsrights:RightsHolderContactEmail></metsrights:RightsHolderContact>'); }
            ln.push('          </metsrights:RightsHolder>');
        }
        ln.push('          <metsrights:Context CONTEXTCLASS="' + esc(ctxCls) + '" OTHERCONTEXTTYPE="' + esc(ctxTyp) + '" CONTEXTID="' + esc(ctxId) + '">');
        ln.push('            <metsrights:UserName>' + esc(ctxTyp) + '</metsrights:UserName>');
        ln.push('          </metsrights:Context>');
        ln.push('        </metsrights:RightsDeclarationMD>');
        ln.push('      </mets:xmlData></mets:mdWrap>');
        ln.push('    </mets:rightsMD>');

        // ── rightsMD DCT ────────────────────────────────────────────────────
        ln.push('    <mets:rightsMD ID="DCTrights">');
        ln.push('      <mets:mdWrap MDTYPE="DC" MIMETYPE="text/xml" LABEL="DCT Rights Metadata"><mets:xmlData>');
        ln.push('        <dct:license xmlns:dct="' + EMETS_NS.dct + '">' + esc(licUri) + '</dct:license>');
        ln.push('        <dct:rights xmlns:dct="' + EMETS_NS.dct + '">' + esc(rightS) + '</dct:rights>');
        ln.push('      </mets:xmlData></mets:mdWrap>');
        ln.push('    </mets:rightsMD>');

        ln.push('  </mets:amdSec>');
        return ln.join('\n');
    }

    function fileSec(inventory) {
        var USE_ORDER = ['ARCHIVE', 'SERVICE', 'HIGH', 'OTHER'];
        var groups = {};
        inventory.forEach(function(f) {
            if (!groups[f.use]) groups[f.use] = [];
            groups[f.use].push(f);
        });

        var ln = ['  <mets:fileSec>',
                  '    <mets:fileGrp ID="FILEGRP_INTERNAL" USE="INTERNAL">',
                  '      <mets:fileGrp ID="FILEGRP_TEXT" USE="TEXT">'];
        USE_ORDER.forEach(function(use) {
            if (!groups[use]) return;
            ln.push('        <mets:fileGrp ID="FILEGRP_' + use + '" USE="' + use + '">');
            groups[use].forEach(function(f) {
                ln.push('          <mets:file ADMID="' + f.techId + '" ID="' + f.fileId + '" MIMETYPE="' + f.mime + '" SEQ="' + f.prog + '">');
                ln.push('            <mets:FLocat LOCTYPE="URL" xmlns:xlink="' + EMETS_NS.xlink + '" xlink:href="' + esc(f.href) + '"/>');
                ln.push('          </mets:file>');
            });
            ln.push('        </mets:fileGrp>');
        });
        ln.push('      </mets:fileGrp>', '    </mets:fileGrp>', '  </mets:fileSec>');
        return ln.join('\n');
    }

    function structMap(scanRows, inventory, logicalId) {
        var scanMeta = {};
        scanRows.forEach(function(scan) {
            var p = parseInt(v(scan, 'progressivo'), 10);
            if (!isNaN(p)) {
                scanMeta[p] = {
                    label: v(scan, 'titolo_pagina') || v(scan, 'label', 'Carta ' + p),
                    tipo:  v(scan, 'tipologia_scansione', 'carta')
                };
            }
        });

        var pageFiles = {};
        inventory.forEach(function(f) {
            if (!pageFiles[f.prog]) pageFiles[f.prog] = [];
            pageFiles[f.prog].push(f.fileId);
        });

        var ln = ['  <mets:structMap TYPE="PHYSICAL">', '    <mets:div DMDID="DMD01" TYPE="FOLDER">'];
        Object.keys(pageFiles).map(Number).sort(function(a,b){return a-b;}).forEach(function(prog) {
            var meta = scanMeta[prog] || { label: 'Carta ' + prog, tipo: 'carta' };
            var pad  = String(prog).padStart(4, '0');
            ln.push('      <mets:div ID="DO_' + logicalId + '_' + pad + '" LABEL="' + esc(meta.label) + '" ORDER="' + prog + '" TYPE="' + esc(meta.tipo) + '">');
            pageFiles[prog].forEach(function(fid) { ln.push('        <mets:fptr FILEID="' + fid + '"/>'); });
            ln.push('      </mets:div>');
        });
        ln.push('    </mets:div>', '  </mets:structMap>');
        return ln.join('\n');
    }

    return {
        /**
         * Genera XML METS ECO-MiC 1.2 da una riga Documento e le sue righe Scansioni.
         * @param {Object} docRow   - riga dal foglio Documento
         * @param {Array}  scanRows - righe dal foglio Scansioni per questa unità
         * @returns {string} XML completo
         */
        generate: function(docRow, scanRows) {
            var codIst     = (docRow.codice_istituto || '').trim();
            var codOgg     = (docRow.codice_oggetto  || '').trim();
            var logicalId  = codOgg;
            var objId      = codIst + '+' + codOgg;
            var now        = new Date().toISOString().replace(/\.\d{3}Z$/, '');
            var inventory  = buildInventory(docRow, scanRows, logicalId);

            var parts = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<mets:mets PROFILE="METS ECO-MiC 1.2" OBJID="METS_' + esc(objId) + '"',
                '  xmlns:mets="' + EMETS_NS.mets + '"',
                '  xmlns:mods="' + EMETS_NS.mods + '"',
                '  xmlns:mix="'  + EMETS_NS.mix  + '"',
                '  xmlns:dct="'  + EMETS_NS.dct  + '"',
                '  xmlns:metsrights="' + EMETS_NS.metsrights + '"',
                '  xmlns:xlink="' + EMETS_NS.xlink + '"',
                '  xmlns:xsi="'  + EMETS_NS.xsi  + '"',
                '  xsi:schemaLocation="' + EMETS_SCHEMA_LOC + '">',
                metsHeader(docRow, logicalId, now),
                dmdSec(docRow, logicalId),
                amdSec(docRow, inventory),
                fileSec(inventory),
                structMap(scanRows, inventory, logicalId),
                '</mets:mets>'
            ];
            return parts.join('\n');
        }
    };
})();

// ── ExcelBatchProcessor ────────────────────────────────────────────────────────

var ExcelBatchProcessor = (function() {

    var CHECKPOINT_KEY = 'filza_batch_checkpoint';

    /**
     * Costruisce una mappa name→DirHandle delle cartelle unità nella root.
     * Supporta struttura piatta (root/CodIst+CodOgg/) e annidata (root/CodIst/CodIst+CodOgg/).
     */
    async function buildFolderMap(rootDirHandle) {
        var map = {};
        try {
            for await (var entry of rootDirHandle.values()) {
                if (entry.kind !== 'directory') continue;
                var n = entry.name;
                if (n.includes('+')) {
                    map[n] = entry;               // cartella diretta PND
                } else {
                    // potrebbe essere un folder CodIst → esplora un livello
                    try {
                        for await (var child of entry.values()) {
                            if (child.kind === 'directory' && child.name.includes('+')) {
                                map[child.name] = child;
                            }
                        }
                    } catch (e) { /* ignora */ }
                }
            }
        } catch (e) {
            console.warn('buildFolderMap error:', e);
        }
        return map;
    }

    async function writeXml(folderMap, codIst, codOgg, xml) {
        var unitName = codIst + '+' + codOgg;
        var unitHandle = folderMap[unitName];
        if (!unitHandle) {
            throw new Error('Cartella "' + unitName + '" non trovata nella root selezionata');
        }
        var metsHandle = await unitHandle.getDirectoryHandle('mets', { create: true });
        var fileHandle = await metsHandle.getFileHandle(unitName + '.xml', { create: true });
        var writable   = await fileHandle.createWritable();
        await writable.write(xml);
        await writable.close();
    }

    function sleep(ms) {
        return new Promise(function(r) { setTimeout(r, ms); });
    }

    return {
        getCheckpoint: function() {
            try { return JSON.parse(localStorage.getItem(CHECKPOINT_KEY) || 'null'); } catch (e) { return null; }
        },

        saveCheckpoint: function(cp) {
            try { localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp)); } catch (e) {}
        },

        clearCheckpoint: function() {
            try { localStorage.removeItem(CHECKPOINT_KEY); } catch (e) {}
        },

        /**
         * Esegue il batch. Chiama onProgress({ index, total, codIst, codOgg, status, result })
         * dopo ogni unità. stopRef.current = true per interrompere.
         *
         * options: { startFromIndex, validate, validationDelay, existingResults }
         */
        run: async function(docRows, scansByUnit, rootDirHandle, options, onProgress, stopRef) {
            var total       = docRows.length;
            var startFrom   = options.startFromIndex || 0;
            var doValidate  = options.validate !== false;
            var valDelay    = options.validationDelay || 300;   // ms tra richieste API
            var results     = options.existingResults
                              ? options.existingResults.slice()
                              : new Array(total).fill(null);

            // Costruisci mappa cartelle una volta sola
            var folderMap = await buildFolderMap(rootDirHandle);

            for (var i = startFrom; i < total; i++) {
                if (stopRef && stopRef.current) break;

                var docRow  = docRows[i];
                var codIst  = (docRow.codice_istituto || '').trim();
                var codOgg  = (docRow.codice_oggetto  || '').trim();
                var scans   = scansByUnit[codOgg] || scansByUnit[''] || [];

                onProgress({ index: i, total, codIst, codOgg, status: 'processing' });

                var result = { index: i, codIst: codIst, codOgg: codOgg };

                // 1. Genera XML
                try {
                    var xml = ExcelMETSGenerator.generate(docRow, scans);
                    result.xml = xml;   // tenuto solo per la validazione, poi rilasciato
                    result.status = 'generated';
                } catch (err) {
                    result.status = 'error';
                    result.error  = 'Generazione XML: ' + err.message;
                    results[i]    = result;
                    this.saveCheckpoint({ total, processedUpTo: i + 1, results: _compactResults(results) });
                    onProgress({ index: i, total, codIst, codOgg, status: 'error', result: result });
                    await sleep(0);
                    continue;
                }

                // 2. Scrivi su disco
                try {
                    await writeXml(folderMap, codIst, codOgg, xml);
                    result.status = 'saved';
                } catch (err) {
                    result.status = 'error';
                    result.error  = 'Scrittura file: ' + err.message;
                    results[i]    = result;
                    this.saveCheckpoint({ total, processedUpTo: i + 1, results: _compactResults(results) });
                    onProgress({ index: i, total, codIst, codOgg, status: 'error', result: result });
                    await sleep(0);
                    continue;
                }

                // 3. Valida con API Cineca (opzionale)
                if (doValidate) {
                    onProgress({ index: i, total, codIst, codOgg, status: 'validating' });
                    try {
                        var unitName = codIst + '+' + codOgg;
                        var valRaw   = await METSValidator.validate(xml, unitName + '.xml');
                        var valFmt   = METSValidator.formatResult(valRaw);
                        result.validation = {
                            status:     valFmt.status,
                            message:    valFmt.message,
                            errorCount: (valFmt.details || []).length,
                            errors:     (valFmt.details || []).slice(0, 20)  // primi 20 errori
                        };
                        result.status = 'done';
                    } catch (err) {
                        result.validation = { status: 'error', message: err.message, errors: [] };
                        result.status = 'done';
                    }
                    await sleep(valDelay);   // rispetta eventuali rate limit API
                } else {
                    result.status = 'done';
                }

                // Rilascia XML dalla memoria (già scritto su disco)
                delete result.xml;

                results[i] = result;
                this.saveCheckpoint({ total, processedUpTo: i + 1, results: _compactResults(results) });
                onProgress({ index: i, total, codIst, codOgg, status: result.status, result: result });
                await sleep(0);   // yield al browser
            }

            // Pulizia checkpoint se completato senza interruzioni
            var allDone = results.every(function(r) { return r && r.status !== null; });
            if (allDone) this.clearCheckpoint();

            return results;
        }
    };

    function _compactResults(results) {
        // Salva nel checkpoint solo i campi essenziali (non l'XML)
        return results.map(function(r) {
            if (!r) return null;
            return { index: r.index, codIst: r.codIst, codOgg: r.codOgg, status: r.status, error: r.error || null, validation: r.validation || null };
        });
    }
})();

// Esporta globale
if (typeof window !== 'undefined') {
    window.ExcelParser      = ExcelParser;
    window.ExcelMETSGenerator = ExcelMETSGenerator;
    window.ExcelBatchProcessor = ExcelBatchProcessor;
}
