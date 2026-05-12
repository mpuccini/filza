/**
 * METS ECO-MiC 1.2 Generator
 * Generates METS XML compliant with ECO-MiC 1.2 standard for Italian archival description
 * Reference: https://github.com/icdp-digital-library/profilo-mets-ecomic
 */

const METSGenerator = {
    // Namespaces
    namespaces: {
        mets: 'http://www.loc.gov/METS/',
        mods: 'http://www.loc.gov/mods/v3',
        mix: 'http://www.loc.gov/mix/v20',
        dct: 'http://purl.org/dc/terms/',
        metsrights: 'http://cosimo.stanford.edu/sdr/metsrights/',
        xlink: 'http://www.w3.org/1999/xlink',
        xsi: 'http://www.w3.org/2001/XMLSchema-instance'
    },

    // Schema locations (matching official ECO-MiC 1.2 examples)
    schemaLocation: 'http://www.loc.gov/METS/ http://www.loc.gov/standards/mets/mets.xsd ' +
        'http://www.loc.gov/mix/v20 http://www.loc.gov/standards/mix/mix20/mix20.xsd ' +
        'http://www.loc.gov/mods/v3 http://www.loc.gov/mods/v3/mods-3-7.xsd ' +
        'http://cosimo.stanford.edu/sdr/metsrights/ https://www.loc.gov/standards/rights/METSRights.xsd',

    // Folder name → ECO-MiC USE mapping.
    // Retrocompatibile con archivia-lite (master/calibrato/derivato/icc)
    // ed estesa alla convenzione PND/ECO-MiC (dng/tiff/jpg/icc/logs/mets).
    folderToUse: {
        // Convenzione archivia-lite originale
        'master':    'ARCHIVE',
        'calibrato': 'SERVICE',
        'derivato':  'HIGH',
        'icc':       'STORAGE',
        // Convenzione PND/ECO-MiC: cartella per estensione
        'dng':  'ARCHIVE',
        'raw':  'ARCHIVE',
        'tiff': 'SERVICE',
        'tif':  'SERVICE',
        'jpg':  'HIGH',
        'jpeg': 'HIGH',
        'png':  'HIGH',
        'logs': null,  // ignorato in fileSec (log di scansione)
        'mets': null   // ignorato (output dello strumento stesso)
    },

    // Fallback: USE inferito dall'estensione del singolo file.
    // Più robusto del nome cartella in caso di scansioni miste.
    extensionToUse: {
        'dng':  'ARCHIVE',
        'raw':  'ARCHIVE',
        'tif':  'SERVICE',
        'tiff': 'SERVICE',
        'jpg':  'HIGH',
        'jpeg': 'HIGH',
        'png':  'HIGH',
        'icc':  'STORAGE',
        'icm':  'STORAGE'
    },

    // File extension to format prefix (for IDs)
    formatPrefix: {
        'tif': 'TIFF', 'tiff': 'TIFF',
        'jpg': 'JPEG', 'jpeg': 'JPEG',
        'dng': 'DNG', 'png': 'PNG',
        'icc': 'ICC', 'icm': 'ICC'
    },

    // Default compression by format
    defaultCompression: {
        'image/tiff': 'Uncompressed',
        'image/jpeg': 'JPEG',
        'image/x-adobe-dng': 'Uncompressed',
        'image/png': 'Deflate'
    },

    // Default byte order by format
    defaultByteOrder: {
        'image/tiff': 'little endian',
        'image/jpeg': 'big endian',
        'image/x-adobe-dng': 'little endian',
        'image/png': 'big endian'
    },

    /**
     * Generate complete METS ECO-MiC 1.2 XML
     * @param {Object} entity - Archive/entity data
     * @param {Object} document - Document metadata
     * @param {Object} folderStructure - Extracted folder structure with files
     * @returns {string} - Complete METS XML string
     */
    generate(entity, document, folderStructure) {
        // logicalId: preferisce il codice oggetto se è stato parsato dal nome cartella;
        // altrimenti fallback al vecchio schema entity.code + '_' + folderNumber.
        var logicalId = document.logicalId || (entity.code + '_' + document.folderNumber);
        var now = new Date().toISOString().replace(/\.\d{3}Z$/, '');

        // Build file inventory for cross-referencing between sections
        var inventory = this._buildFileInventory(entity, document, folderStructure);

        var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += this._openMetsRoot(logicalId);
        xml += this._metsHeader(entity, document, logicalId, now);
        xml += this._descriptiveMetadata(entity, document, logicalId);
        xml += this._administrativeMetadata(entity, document, inventory);
        xml += this._fileSection(inventory);
        xml += this._structuralMap(document, inventory, logicalId);
        xml += '</mets:mets>\n';

        return xml;
    },

    /**
     * Parse il nome di una cartella secondo la nomenclatura PND/ICDP:
     *   <CodiceIstituto>+<CodiceOggetto>
     * Esempio: "IT-RMB576+PFR2_4" → { codiceIstituto: "IT-RMB576", codiceOggetto: "PFR2_4" }
     * Ritorna null se il nome non è conforme.
     */
    parseFolderName: function(folderName) {
        if (!folderName || typeof folderName !== 'string') return null;
        // Codice istituto: senza spazi, senza '+'. Codice oggetto: idem.
        var match = folderName.match(/^([A-Za-z0-9\-_.]+)\+([A-Za-z0-9\-_.]+)$/);
        if (!match) return null;
        return {
            codiceIstituto: match[1],
            codiceOggetto: match[2]
        };
    },

    /**
     * Parse il nome di un file secondo la nomenclatura PND/ICDP:
     *   <CodiceIstituto>+<CodiceOggetto>+<NumeroProgressivo>.<estensione>
     * Esempio: "IT-RMB576+PFR2_4+00001.tif" → { progressivo: 1, progressivoStr: "00001", ext: "tif" }
     * Tollerante anche al vecchio formato a 4 cifre con suffisso r/v:
     *   "IT-RMB576+PFR2_4+0001r.tif" → { progressivo: 1, progressivoStr: "00001", ext: "tif", lato: "r" }
     * Ritorna null se il nome non è conforme.
     */
    parseFileName: function(fileName) {
        if (!fileName || typeof fileName !== 'string') return null;
        // Pattern: prefisso+CodOgg+NNNNN(r|v)?.ext
        var match = fileName.match(/\+(\d{4,6})([rRvV]?)\.([A-Za-z0-9]+)$/);
        if (!match) return null;
        var num = parseInt(match[1], 10);
        return {
            progressivo: num,
            progressivoStr: String(num).padStart(5, '0'),  // SEMPRE 5 cifre output
            lato: match[2] ? match[2].toLowerCase() : null,  // r/v se presente
            ext: match[3].toLowerCase()
        };
    },

    /**
     * Build a structured file inventory for cross-referencing.
     *
     * folderStructure è un oggetto con chiavi nominate (master/calibrato/derivato/icc/
     * dng/tiff/jpg/...): contiene array di file per ciascuna sottocartella.
     *
     * Il "USE" METS viene determinato così, in ordine di priorità:
     *   1) extensionToUse[ext del file] — più affidabile
     *   2) folderToUse[nome cartella] — fallback
     *   3) 'OTHER' come default
     *
     * Il numero progressivo viene letto dal nome file se conforme PND;
     * altrimenti si rinumera per posizione nell'array (idx + 1).
     */
    _buildFileInventory(entity, document, folderStructure) {
        var self = this;
        var logicalId = document.logicalId || (entity.code + '_' + document.folderNumber);
        var groups = [];
        var allFiles = [];

        // Ordine canonico delle cartelle (per stabilità output)
        var preferredOrder = [
            'dng', 'raw', 'master',
            'tiff', 'tif', 'calibrato',
            'jpg', 'jpeg', 'png', 'derivato',
            'icc'
        ];
        // Aggiungo eventuali altre chiavi non previste in ordine alfabetico
        var allKeys = Object.keys(folderStructure || {});
        var ordered = preferredOrder.filter(function(k) { return allKeys.indexOf(k) !== -1; });
        allKeys.forEach(function(k) {
            if (ordered.indexOf(k) === -1) ordered.push(k);
        });

        ordered.forEach(function(folder) {
            var files = folderStructure[folder];
            if (!files || !Array.isArray(files) || files.length === 0) return;

            // USE per la cartella (può essere null = "ignora questa cartella")
            var folderUse = self.folderToUse.hasOwnProperty(folder) ? self.folderToUse[folder] : undefined;
            if (folderUse === null) return;  // skip esplicito

            var groupFiles = [];

            files.forEach(function(file, idx) {
                var ext = file.name.split('.').pop().toLowerCase();
                // USE definitivo: estensione > cartella > OTHER
                var use = self.extensionToUse[ext] || folderUse || 'OTHER';

                // Progressivo: dal nome file se PND-conforme, altrimenti dalla posizione
                var parsed = self.parseFileName(file.name);
                var seq, seqStr;
                if (parsed) {
                    seq = parsed.progressivo;
                    seqStr = parsed.progressivoStr;  // 5 cifre
                } else {
                    seq = idx + 1;
                    seqStr = String(seq).padStart(5, '0');
                }

                var formatPfx = self.formatPrefix[ext] || ext.toUpperCase();
                var mimeType = self._getMimeType(file.name);

                var entry = {
                    name: file.name,
                    size: file.size,
                    folder: folder,
                    use: use,
                    seq: seq,
                    seqStr: seqStr,
                    lato: parsed ? parsed.lato : null,
                    mimeType: mimeType,
                    formatPrefix: formatPfx,
                    fileId: formatPfx + '_' + logicalId + '_' + seqStr,
                    techMdId: 'TD_' + formatPfx + '_' + logicalId + '_' + seqStr,
                    href: './' + folder + '/' + file.name,
                    checksum: file.checksum || '',
                    checksumType: file.checksumType || 'MD5',
                    // Metadati tecnici letti dal file (popolati da app.js se exifr disponibile)
                    width: file.width || null,
                    height: file.height || null,
                    dpi: file.dpi || null,
                    bitDepth: file.bitDepth || null,
                    colorSpace: file.colorSpace || null,
                    iccProfileName: file.iccProfileName || null
                };

                groupFiles.push(entry);
                allFiles.push(entry);
            });

            // Raggruppo per USE (non per cartella) — se più cartelle producono lo
            // stesso USE (es. file misti) finiscono nello stesso fileGrp.
            // Per ora teniamo un gruppo per cartella per semplicità.
            groups.push({ folder: folder, use: groupFiles[0] ? groupFiles[0].use : (folderUse || 'OTHER'), files: groupFiles });
        });

        return { groups: groups, allFiles: allFiles, logicalId: logicalId };
    },

    _openMetsRoot(logicalId) {
        return '<mets:mets PROFILE="METS ECO-MiC 1.2" OBJID="METS_' + logicalId + '"' +
            ' xmlns:mets="' + this.namespaces.mets + '"' +
            ' xmlns:dct="' + this.namespaces.dct + '"' +
            ' xmlns:mix="' + this.namespaces.mix + '"' +
            ' xmlns:mods="' + this.namespaces.mods + '"' +
            ' xmlns:metsrights="' + this.namespaces.metsrights + '"' +
            ' xmlns:xlink="' + this.namespaces.xlink + '"' +
            ' xmlns:xsi="' + this.namespaces.xsi + '"' +
            ' xsi:schemaLocation="' + this.schemaLocation + '">\n';
    },

    /**
     * metsHdr - ECO-MiC 1.2: ID attribute, CREATOR + CUSTODIAN + IPOWNER agents
     */
    _metsHeader(entity, document, logicalId, now) {
        var recordStatus = document.recordStatus || 'COMPLETE';
        // ID must be a valid NCName (cannot start with a digit)
        var headerId = 'HDR_' + (document.folderNumber || logicalId);

        var h = '\t<mets:metsHdr ID="' + this._escapeXml(headerId) + '"' +
            ' CREATEDATE="' + now + '"' +
            ' LASTMODDATE="' + now + '"' +
            ' RECORDSTATUS="' + recordStatus + '">\n';

        // CREATOR agent
        var creatorName = entity.creatorName || entity.name;
        h += '\t\t<mets:agent ROLE="CREATOR" TYPE="ORGANIZATION">\n';
        h += '\t\t\t<mets:name>' + this._escapeXml(creatorName) + '</mets:name>\n';
        h += '\t\t</mets:agent>\n';

        // CUSTODIAN agent
        h += '\t\t<mets:agent ROLE="CUSTODIAN" TYPE="ORGANIZATION">\n';
        h += '\t\t\t<mets:name>' + this._escapeXml(entity.name) + '</mets:name>\n';
        h += '\t\t</mets:agent>\n';

        // IPOWNER agent (ECO-MiC 1.2 requirement)
        var ipOwnerName = entity.ipOwnerName || entity.creatorName || entity.name;
        h += '\t\t<mets:agent ROLE="IPOWNER" TYPE="ORGANIZATION">\n';
        h += '\t\t\t<mets:name>' + this._escapeXml(ipOwnerName) + '</mets:name>\n';
        h += '\t\t</mets:agent>\n';

        h += '\t</mets:metsHdr>\n';
        return h;
    },

    /**
     * dmdSec - ECO-MiC 1.2 descriptive metadata (MODS)
     */
    _descriptiveMetadata(entity, document, logicalId) {
        // STATUS reflects recordStatus in lowercase
        var status = (document.recordStatus || 'COMPLETE').toLowerCase();

        var d = '\t<mets:dmdSec ID="DMD01" STATUS="' + status + '">\n';
        d += '\t\t<mets:mdWrap MDTYPE="MODS">\n';
        d += '\t\t\t<mets:xmlData>\n';
        d += '\t\t\t\t<mods:mods xmlns:mods="' + this.namespaces.mods + '">\n';

        // Identifiers (ECO-MiC 1.2 required)
        d += '\t\t\t\t\t<mods:identifier type="logicalId">' + this._escapeXml(logicalId) + '</mods:identifier>\n';

        // conservativeId is required by ECO-MiC - always output
        var conservativeId = entity.conservativeId || entity.code || '';
        d += '\t\t\t\t\t<mods:identifier type="conservativeId">' + this._escapeXml(conservativeId) + '</mods:identifier>\n';

        if (entity.conservativeIdAuthority) {
            d += '\t\t\t\t\t<mods:identifier type="conservativeIdAuthority">' + this._escapeXml(entity.conservativeIdAuthority) + '</mods:identifier>\n';
        }

        // relationId (ECO-MiC requirement)
        d += '\t\t\t\t\t<mods:identifier type="relationId">representation</mods:identifier>\n';

        // Record Info (ECO-MiC 1.2 requirement)
        if (entity.recordContentSource) {
            d += '\t\t\t\t\t<mods:recordInfo>\n';
            d += '\t\t\t\t\t\t<mods:recordContentSource>' + this._escapeXml(entity.recordContentSource) + '</mods:recordContentSource>\n';
            d += '\t\t\t\t\t</mods:recordInfo>\n';
        }

        // Type of Resource
        var resourceType = document.typeOfResource || 'documento testuale';
        d += '\t\t\t\t\t<mods:typeOfResource>' + this._escapeXml(resourceType) + '</mods:typeOfResource>\n';

        // Title
        if (document.title) {
            d += '\t\t\t\t\t<mods:titleInfo>\n';
            d += '\t\t\t\t\t\t<mods:title>' + this._escapeXml(document.title) + '</mods:title>\n';
            d += '\t\t\t\t\t</mods:titleInfo>\n';
        }

        // Abstract/Description
        if (document.description) {
            d += '\t\t\t\t\t<mods:abstract>' + this._escapeXml(document.description) + '</mods:abstract>\n';
        }

        // Soggetto Produttore (ECO-MiC: corporate name with authority="IPAC")
        var producerName = entity.producerName || '';
        if (producerName) {
            d += '\t\t\t\t\t<mods:name type="corporate">\n';
            d += '\t\t\t\t\t\t<mods:namePart>' + this._escapeXml(producerName) + '</mods:namePart>\n';
            d += '\t\t\t\t\t\t<mods:role>\n';
            d += '\t\t\t\t\t\t\t<mods:roleTerm type="text" authority="IPAC">Soggetto Produttore</mods:roleTerm>\n';
            d += '\t\t\t\t\t\t</mods:role>\n';
            d += '\t\t\t\t\t</mods:name>\n';
        }

        // Soggetto Conservatore (ECO-MiC: the custodian archive)
        d += '\t\t\t\t\t<mods:name type="corporate">\n';
        d += '\t\t\t\t\t\t<mods:namePart>' + this._escapeXml(entity.name) + '</mods:namePart>\n';
        d += '\t\t\t\t\t\t<mods:role>\n';
        d += '\t\t\t\t\t\t\t<mods:roleTerm type="text" authority="IPAC">Soggetto Conservatore</mods:roleTerm>\n';
        d += '\t\t\t\t\t\t</mods:role>\n';
        d += '\t\t\t\t\t</mods:name>\n';

        // Personal names (optional)
        if (document.personalNames) {
            var names = document.personalNames.split(/[,;]/).map(function(s) { return s.trim(); }).filter(Boolean);
            names.forEach(function(name) {
                d += '\t\t\t\t\t<mods:name type="personal">\n';
                d += '\t\t\t\t\t\t<mods:namePart>' + METSGenerator._escapeXml(name) + '</mods:namePart>\n';
                d += '\t\t\t\t\t</mods:name>\n';
            });
        }

        // Origin Info (dates)
        if (document.dateFrom || document.dateTo) {
            d += '\t\t\t\t\t<mods:originInfo>\n';
            if (document.dateFrom && document.dateTo) {
                d += '\t\t\t\t\t\t<mods:dateCreated point="start">' + this._escapeXml(document.dateFrom) + '</mods:dateCreated>\n';
                d += '\t\t\t\t\t\t<mods:dateCreated point="end">' + this._escapeXml(document.dateTo) + '</mods:dateCreated>\n';
            } else if (document.dateFrom) {
                d += '\t\t\t\t\t\t<mods:dateCreated>' + this._escapeXml(document.dateFrom) + '</mods:dateCreated>\n';
            } else if (document.dateTo) {
                d += '\t\t\t\t\t\t<mods:dateCreated>' + this._escapeXml(document.dateTo) + '</mods:dateCreated>\n';
            }
            d += '\t\t\t\t\t</mods:originInfo>\n';
        }

        // Physical Description
        if (document.physicalForm || document.extentDescription || document.totalPages) {
            d += '\t\t\t\t\t<mods:physicalDescription>\n';
            if (document.physicalForm) {
                d += '\t\t\t\t\t\t<mods:form>' + this._escapeXml(document.physicalForm) + '</mods:form>\n';
            }
            if (document.extentDescription) {
                d += '\t\t\t\t\t\t<mods:extent>' + this._escapeXml(document.extentDescription) + '</mods:extent>\n';
            } else if (document.totalPages) {
                d += '\t\t\t\t\t\t<mods:extent>' + document.totalPages + ' cc.</mods:extent>\n';
            }
            d += '\t\t\t\t\t</mods:physicalDescription>\n';
        }

        // Physical Location (ECO-MiC 1.2 COMPLETE)
        var physicalLocation = entity.physicalLocation || entity.name;
        if (physicalLocation) {
            d += '\t\t\t\t\t<mods:location>\n';
            d += '\t\t\t\t\t\t<mods:physicalLocation type="current">' + this._escapeXml(physicalLocation) + '</mods:physicalLocation>\n';
            d += '\t\t\t\t\t</mods:location>\n';
        }

        // Related Item - archival collection (ECO-MiC: otherType="collection")
        if (entity.fundName) {
            d += '\t\t\t\t\t<mods:relatedItem otherType="collection">\n';
            d += '\t\t\t\t\t\t<mods:titleInfo>\n';
            d += '\t\t\t\t\t\t\t<mods:title>' + this._escapeXml(entity.fundName) + '</mods:title>\n';
            d += '\t\t\t\t\t\t</mods:titleInfo>\n';
            d += '\t\t\t\t\t</mods:relatedItem>\n';
        }

        d += '\t\t\t\t</mods:mods>\n';
        d += '\t\t\t</mets:xmlData>\n';
        d += '\t\t</mets:mdWrap>\n';
        d += '\t</mets:dmdSec>\n';

        return d;
    },

    /**
     * amdSec - techMD (NISOIMG) + rightsMD (METSRIGHTS + DC)
     */
    _administrativeMetadata(entity, document, inventory) {
        var a = '\t<mets:amdSec ID="AMD1">\n';

        // Technical Metadata for each file (must come before rightsMD per METS schema)
        var self = this;
        inventory.allFiles.forEach(function(file) {
            a += self._generateTechMD(file, entity);
        });

        // Rights Metadata - METSRIGHTS section (ECO-MiC 1.2)
        a += this._generateRightsMD(entity);

        // Rights Metadata - DCT section (ECO-MiC 1.2)
        a += this._generateDCTRightsMD(entity);

        a += '\t</mets:amdSec>\n';
        return a;
    },

    /**
     * techMD per file - ECO-MiC 1.2: MDTYPE="NISOIMG", detailed MIX metadata
     */
    _generateTechMD(file, entity) {
        var t = '\t\t<mets:techMD ID="' + file.techMdId + '">\n';
        t += '\t\t\t<mets:mdWrap MDTYPE="NISOIMG">\n';
        t += '\t\t\t\t<mets:xmlData>\n';
        t += '\t\t\t\t\t<mix:mix xmlns:mix="' + this.namespaces.mix + '"' +
            ' xsi:schemaLocation="' + this.namespaces.mix + ' http://www.loc.gov/standards/mix/mix20/mix20.xsd">\n';

        // BasicDigitalObjectInformation
        t += '\t\t\t\t\t\t<mix:BasicDigitalObjectInformation>\n';
        t += '\t\t\t\t\t\t\t<mix:ObjectIdentifier>\n';
        t += '\t\t\t\t\t\t\t\t<mix:objectIdentifierType>local</mix:objectIdentifierType>\n';
        t += '\t\t\t\t\t\t\t\t<mix:objectIdentifierValue>' + this._escapeXml(file.name) + '</mix:objectIdentifierValue>\n';
        t += '\t\t\t\t\t\t\t</mix:ObjectIdentifier>\n';

        // Format designation
        t += '\t\t\t\t\t\t\t<mix:FormatDesignation>\n';
        t += '\t\t\t\t\t\t\t\t<mix:formatName>' + this._escapeXml(file.mimeType) + '</mix:formatName>\n';
        t += '\t\t\t\t\t\t\t</mix:FormatDesignation>\n';

        // Byte order
        var byteOrder = this.defaultByteOrder[file.mimeType] || 'big endian';
        t += '\t\t\t\t\t\t\t<mix:byteOrder>' + byteOrder + '</mix:byteOrder>\n';

        // Compression
        var compression = this.defaultCompression[file.mimeType] || 'Unknown';
        t += '\t\t\t\t\t\t\t<mix:Compression>\n';
        t += '\t\t\t\t\t\t\t\t<mix:compressionScheme>' + compression + '</mix:compressionScheme>\n';
        t += '\t\t\t\t\t\t\t</mix:Compression>\n';

        t += '\t\t\t\t\t\t</mix:BasicDigitalObjectInformation>\n';

        // ImageCaptureMetadata (scanner info from entity)
        if (entity.imageProducer || entity.scannerManufacturer || entity.scannerModel) {
            t += '\t\t\t\t\t\t<mix:ImageCaptureMetadata>\n';

            if (entity.imageProducer) {
                t += '\t\t\t\t\t\t\t<mix:GeneralCaptureInformation>\n';
                t += '\t\t\t\t\t\t\t\t<mix:imageProducer>' + this._escapeXml(entity.imageProducer) + '</mix:imageProducer>\n';
                t += '\t\t\t\t\t\t\t</mix:GeneralCaptureInformation>\n';
            }

            if (entity.scannerManufacturer || entity.scannerModel) {
                t += '\t\t\t\t\t\t\t<mix:ScannerCapture>\n';
                if (entity.scannerManufacturer) {
                    t += '\t\t\t\t\t\t\t\t<mix:scannerManufacturer>' + this._escapeXml(entity.scannerManufacturer) + '</mix:scannerManufacturer>\n';
                }
                if (entity.scannerModel) {
                    t += '\t\t\t\t\t\t\t\t<mix:ScannerModel>\n';
                    t += '\t\t\t\t\t\t\t\t\t<mix:scannerModelName>' + this._escapeXml(entity.scannerModel) + '</mix:scannerModelName>\n';
                    t += '\t\t\t\t\t\t\t\t</mix:ScannerModel>\n';
                }
                if (entity.scanningSoftware) {
                    t += '\t\t\t\t\t\t\t\t<mix:ScanningSystemSoftware>\n';
                    t += '\t\t\t\t\t\t\t\t\t<mix:scanningSoftwareName>' + this._escapeXml(entity.scanningSoftware) + '</mix:scanningSoftwareName>\n';
                    t += '\t\t\t\t\t\t\t\t</mix:ScanningSystemSoftware>\n';
                }
                t += '\t\t\t\t\t\t\t</mix:ScannerCapture>\n';
            }

            t += '\t\t\t\t\t\t</mix:ImageCaptureMetadata>\n';
        }

        // ImageAssessmentMetadata (DPI / sampling frequency)
        var dpi = entity.defaultDpi;
        if (dpi) {
            t += '\t\t\t\t\t\t<mix:ImageAssessmentMetadata>\n';
            t += '\t\t\t\t\t\t\t<mix:SpatialMetrics>\n';
            t += '\t\t\t\t\t\t\t\t<mix:samplingFrequencyUnit>in.</mix:samplingFrequencyUnit>\n';
            t += '\t\t\t\t\t\t\t\t<mix:xSamplingFrequency>\n';
            t += '\t\t\t\t\t\t\t\t\t<mix:numerator>' + this._escapeXml(dpi) + '</mix:numerator>\n';
            t += '\t\t\t\t\t\t\t\t</mix:xSamplingFrequency>\n';
            t += '\t\t\t\t\t\t\t\t<mix:ySamplingFrequency>\n';
            t += '\t\t\t\t\t\t\t\t\t<mix:numerator>' + this._escapeXml(dpi) + '</mix:numerator>\n';
            t += '\t\t\t\t\t\t\t\t</mix:ySamplingFrequency>\n';
            t += '\t\t\t\t\t\t\t</mix:SpatialMetrics>\n';
            t += '\t\t\t\t\t\t\t<mix:ImageColorEncoding>\n';
            t += '\t\t\t\t\t\t\t\t<mix:BitsPerSample>\n';
            t += '\t\t\t\t\t\t\t\t\t<mix:bitsPerSampleValue>8</mix:bitsPerSampleValue>\n';
            t += '\t\t\t\t\t\t\t\t\t<mix:bitsPerSampleValue>8</mix:bitsPerSampleValue>\n';
            t += '\t\t\t\t\t\t\t\t\t<mix:bitsPerSampleValue>8</mix:bitsPerSampleValue>\n';
            t += '\t\t\t\t\t\t\t\t\t<mix:bitsPerSampleUnit>integer</mix:bitsPerSampleUnit>\n';
            t += '\t\t\t\t\t\t\t\t</mix:BitsPerSample>\n';
            t += '\t\t\t\t\t\t\t\t<mix:samplesPerPixel>3</mix:samplesPerPixel>\n';
            t += '\t\t\t\t\t\t\t</mix:ImageColorEncoding>\n';
            t += '\t\t\t\t\t\t</mix:ImageAssessmentMetadata>\n';
        }

        t += '\t\t\t\t\t</mix:mix>\n';
        t += '\t\t\t\t</mets:xmlData>\n';
        t += '\t\t\t</mets:mdWrap>\n';
        t += '\t\t</mets:techMD>\n';

        return t;
    },

    /**
     * rightsMD - METSRIGHTS section (ECO-MiC 1.2)
     * Uses RightsDeclarationMD element with RightsHolder and Context
     */
    _generateRightsMD(entity) {
        var r = '\t\t<mets:rightsMD ID="BCS">\n';
        r += '\t\t\t<mets:mdWrap LABEL="Rights Metadata" MDTYPE="METSRIGHTS" MIMETYPE="text/xml">\n';
        r += '\t\t\t\t<mets:xmlData>\n';
        r += '\t\t\t\t\t<metsrights:RightsDeclarationMD>\n';

        // Primary rights holder (e.g., Ministry) - RIGHTSHOLDERID is required by schema
        if (entity.rightsHolder) {
            var holderId = entity.rightsHolderId || entity.code || 'UNKNOWN';
            r += '\t\t\t\t\t\t<metsrights:RightsHolder RIGHTSHOLDERID="' + this._escapeXml(holderId) + '">\n';
            r += '\t\t\t\t\t\t\t<metsrights:RightsHolderName>' + this._escapeXml(entity.rightsHolder) + '</metsrights:RightsHolderName>\n';
            r += '\t\t\t\t\t\t</metsrights:RightsHolder>\n';
        }

        // Secondary rights holder (the archive/custodian) - RIGHTSHOLDERID is required by schema
        if (entity.conservativeId || entity.name) {
            var archiveHolderId = entity.conservativeId || entity.code || 'UNKNOWN';
            r += '\t\t\t\t\t\t<metsrights:RightsHolder RIGHTSHOLDERID="' + this._escapeXml(archiveHolderId) + '">\n';
            r += '\t\t\t\t\t\t\t<metsrights:RightsHolderName>' + this._escapeXml(entity.name) + '</metsrights:RightsHolderName>\n';
            if (entity.rightsHolderEmail) {
                r += '\t\t\t\t\t\t\t<metsrights:RightsHolderContact>\n';
                r += '\t\t\t\t\t\t\t\t<metsrights:RightsHolderContactEmail>' + this._escapeXml(entity.rightsHolderEmail) + '</metsrights:RightsHolderContactEmail>\n';
                r += '\t\t\t\t\t\t\t</metsrights:RightsHolderContact>\n';
            }
            r += '\t\t\t\t\t\t</metsrights:RightsHolder>\n';
        }

        // Context (ECO-MiC 1.2 standard IPAC context)
        var contextClass = entity.rightsContextClass || 'OTHER';
        var contextType = entity.rightsContextType || 'Standard-IPAC';
        var contextId = entity.rightsContextId || 'IPAC-PDP-001';
        r += '\t\t\t\t\t\t<metsrights:Context CONTEXTCLASS="' + this._escapeXml(contextClass) + '"' +
            ' OTHERCONTEXTTYPE="' + this._escapeXml(contextType) + '"' +
            ' CONTEXTID="' + this._escapeXml(contextId) + '">\n';
        r += '\t\t\t\t\t\t\t<metsrights:UserName>' + this._escapeXml(contextType) + '</metsrights:UserName>\n';
        r += '\t\t\t\t\t\t</metsrights:Context>\n';

        r += '\t\t\t\t\t</metsrights:RightsDeclarationMD>\n';
        r += '\t\t\t\t</mets:xmlData>\n';
        r += '\t\t\t</mets:mdWrap>\n';
        r += '\t\t</mets:rightsMD>\n';

        return r;
    },

    /**
     * rightsMD - DCT Rights section (ECO-MiC 1.2)
     * Separate rightsMD for dct:license and dct:rights
     */
    _generateDCTRightsMD(entity) {
        // ECO-MiC 1.2 requires at least 2 rightsMD sections - always generate this one
        var dctLicense = entity.dctLicense || '';
        var dctRights = entity.dctRights || '';

        var r = '\t\t<mets:rightsMD ID="DCTrights">\n';
        r += '\t\t\t<mets:mdWrap MDTYPE="DC" MIMETYPE="text/xml" LABEL="DCT Rights Metadata">\n';
        r += '\t\t\t\t<mets:xmlData>\n';

        r += '\t\t\t\t\t<dct:license>' + this._escapeXml(dctLicense || 'https://creativecommons.org/publicdomain/mark/1.0/') + '</dct:license>\n';
        r += '\t\t\t\t\t<dct:rights>' + this._escapeXml(dctRights || 'Public Domain') + '</dct:rights>\n';

        r += '\t\t\t\t</mets:xmlData>\n';
        r += '\t\t\t</mets:mdWrap>\n';
        r += '\t\t</mets:rightsMD>\n';

        return r;
    },

    /**
     * fileSec - ECO-MiC 1.2: nested fileGrp structure (INTERNAL > TEXT > ARCHIVE/HIGH)
     */
    _fileSection(inventory) {
        var f = '\t<mets:fileSec>\n';

        // ECO-MiC 1.2 nested structure: INTERNAL > TEXT > (ARCHIVE | HIGH | REFERENCE | ...)
        f += '\t\t<mets:fileGrp ID="FILEGRP_INTERNAL" USE="INTERNAL">\n';
        f += '\t\t\t<mets:fileGrp ID="FILEGRP_TEXT" USE="TEXT">\n';

        var self = this;
        inventory.groups.forEach(function(group) {
            var grpId = 'FILEGRP_' + group.use;
            f += '\t\t\t\t<mets:fileGrp ID="' + grpId + '" USE="' + group.use + '">\n';

            group.files.forEach(function(file) {
                f += '\t\t\t\t\t<mets:file' +
                    ' ADMID="' + file.techMdId + '"' +
                    ' CHECKSUM="' + (file.checksum || '') + '"' +
                    ' CHECKSUMTYPE="' + (file.checksumType || 'MD5') + '"' +
                    ' ID="' + file.fileId + '"' +
                    ' MIMETYPE="' + file.mimeType + '"' +
                    ' SEQ="' + file.seq + '"';

                if (file.size) {
                    f += ' SIZE="' + file.size + '"';
                }

                f += '>\n';
                f += '\t\t\t\t\t\t<mets:FLocat LOCTYPE="URL"' +
                    ' xmlns:xlink="' + self.namespaces.xlink + '"' +
                    ' xlink:href="' + self._escapeXml(file.href) + '"/>\n';
                f += '\t\t\t\t\t</mets:file>\n';
            });

            f += '\t\t\t\t</mets:fileGrp>\n';
        });

        f += '\t\t\t</mets:fileGrp>\n';
        f += '\t\t</mets:fileGrp>\n';
        f += '\t</mets:fileSec>\n';

        return f;
    },

    /**
     * structMap - ECO-MiC 1.2: TYPE="PHYSICAL", root div TYPE="FOLDER",
     * child divs TYPE="FILE" with ID, LABEL, ORDER
     */
    _structuralMap(document, inventory, logicalId) {
        var s = '\t<mets:structMap TYPE="PHYSICAL">\n';

        // Root div: TYPE="FOLDER", DMDID only (no ADMID, no LABEL per ECO-MiC 1.2)
        s += '\t\t<mets:div DMDID="DMD01" TYPE="FOLDER">\n';

        // Group files by page number (sequence within folder)
        // Files from different folders with the same sequence number represent the same page
        var pageMap = {};
        var maxSeq = 0;

        inventory.allFiles.forEach(function(file) {
            if (!pageMap[file.seq]) {
                pageMap[file.seq] = [];
            }
            pageMap[file.seq].push(file);
            if (file.seq > maxSeq) maxSeq = file.seq;
        });

        for (var seq = 1; seq <= maxSeq; seq++) {
            var pageFiles = pageMap[seq];
            if (!pageFiles) continue;

            var seqStr = String(seq).padStart(4, '0');
            var divId = 'DO_' + logicalId + '_' + seqStr;
            var label = document.pageLabel || 'Carta';
            label = label + ' ' + seq;

            s += '\t\t\t<mets:div ID="' + divId + '"' +
                ' LABEL="' + this._escapeXml(label) + '"' +
                ' ORDER="' + seq + '"' +
                ' TYPE="FILE">\n';

            pageFiles.forEach(function(file) {
                s += '\t\t\t\t<mets:fptr FILEID="' + file.fileId + '"/>\n';
            });

            s += '\t\t\t</mets:div>\n';
        }

        s += '\t\t</mets:div>\n';
        s += '\t</mets:structMap>\n';

        return s;
    },

    _getMimeType(filename) {
        var ext = filename.split('.').pop().toLowerCase();
        var mimeTypes = {
            'dng': 'image/x-adobe-dng',
            'tif': 'image/tiff',
            'tiff': 'image/tiff',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'icc': 'application/vnd.iccprofile',
            'icm': 'application/vnd.iccprofile',
            'xml': 'application/xml'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    },

    _escapeXml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    },

    /**
     * Highlight XML for display
     * @param {string} xml - Raw XML string
     * @returns {string} - HTML with syntax highlighting
     */
    highlightXml(xml) {
        return xml
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/(&lt;\?.*?\?&gt;)/g, '<span class="comment">$1</span>')
            .replace(/(&lt;\/?)(\w+:?\w*)/g, '$1<span class="tag">$2</span>')
            .replace(/(\s)(\w+)(=)/g, '$1<span class="attr">$2</span>$3')
            .replace(/(=")(.*?)(")/g, '$1<span class="value">$2</span>$3');
    }
};

// Export for use in browser
if (typeof window !== 'undefined') {
    window.METSGenerator = METSGenerator;
}
