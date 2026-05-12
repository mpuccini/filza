/**
 * Filza - Generatore METS ECO-MiC per archivi storici
 * Web app standalone (zero server, zero build step).
 * Usa htm per template JSX-like senza Babel.
 *
 * Nome del software centralizzato qui: per cambiarlo basta sostituire
 * la costante APP_NAME e i due chiavi di localStorage (le chiavi vecchie
 * non vengono migrate automaticamente).
 */

var APP_NAME = 'Filza';
var APP_TAGLINE = 'Generatore METS ECO-MiC per archivi storici';
var APP_VERSION = '0.1.0';

var html = htm.bind(React.createElement);
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
var useMemo = React.useMemo;
var useRef = React.useRef;
var Fragment = React.Fragment;

// ============================================================================
// Storage Utilities (localStorage)
// ============================================================================

var Storage = {
    ARCHIVES_KEY: 'filza_archives',
    LOG_KEY: 'filza_log',
    SETTINGS_KEY: 'filza_settings',

    getArchives: function() {
        try {
            var data = localStorage.getItem(this.ARCHIVES_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error reading archives:', e);
            return [];
        }
    },

    saveArchives: function(archives) {
        localStorage.setItem(this.ARCHIVES_KEY, JSON.stringify(archives));
    },

    getArchive: function(id) {
        return this.getArchives().find(function(a) { return a.id === id; }) || null;
    },

    createArchive: function(data) {
        var archives = this.getArchives();
        var archive = Object.assign({}, data, {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        archives.push(archive);
        this.saveArchives(archives);
        return archive;
    },

    updateArchive: function(id, data) {
        var archives = this.getArchives();
        var idx = archives.findIndex(function(a) { return a.id === id; });
        if (idx === -1) return null;
        archives[idx] = Object.assign({}, archives[idx], data, { id: id, updatedAt: new Date().toISOString() });
        this.saveArchives(archives);
        return archives[idx];
    },

    deleteArchive: function(id) {
        var archives = this.getArchives().filter(function(a) { return a.id !== id; });
        this.saveArchives(archives);
    },

    getLogs: function() {
        try {
            var data = localStorage.getItem(this.LOG_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error reading logs:', e);
            return [];
        }
    },

    saveLogs: function(logs) {
        localStorage.setItem(this.LOG_KEY, JSON.stringify(logs));
    },

    addLog: function(entry) {
        var logs = this.getLogs();
        logs.unshift(Object.assign({}, entry, {
            id: Date.now().toString(),
            timestamp: new Date().toISOString()
        }));
        this.saveLogs(logs.slice(0, 200));
        return logs;
    },

    clearLogs: function() {
        this.saveLogs([]);
    },

    getSetting: function(key, defaultValue) {
        try {
            var data = localStorage.getItem(this.SETTINGS_KEY);
            var settings = data ? JSON.parse(data) : {};
            return settings[key] !== undefined ? settings[key] : (defaultValue || null);
        } catch (e) {
            return defaultValue || null;
        }
    },

    setSetting: function(key, value) {
        try {
            var data = localStorage.getItem(this.SETTINGS_KEY);
            var settings = data ? JSON.parse(data) : {};
            settings[key] = value;
            localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('Error saving setting:', e);
        }
    },

    exportData: function() {
        var settingsData = {};
        try {
            var data = localStorage.getItem(this.SETTINGS_KEY);
            settingsData = data ? JSON.parse(data) : {};
        } catch (e) {}
        return {
            version: '1.0',
            exportDate: new Date().toISOString(),
            source: 'filza-web',
            archives: this.getArchives(),
            logs: this.getLogs(),
            settings: settingsData
        };
    },

    importData: function(data, mode) {
        if (!data || !data.archives) {
            throw new Error('Formato dati non valido');
        }
        if (mode === 'replace') {
            if (data.archives) this.saveArchives(data.archives);
            if (data.logs) this.saveLogs(data.logs);
            if (data.settings) {
                localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(data.settings));
            }
        } else {
            var existingArchives = this.getArchives();
            var existingIds = {};
            var existingCodes = {};
            existingArchives.forEach(function(a) { existingIds[a.id] = true; existingCodes[a.code] = true; });
            (data.archives || []).forEach(function(archive) {
                if (!existingIds[archive.id] && !existingCodes[archive.code]) {
                    existingArchives.push(archive);
                }
            });
            this.saveArchives(existingArchives);

            if (data.logs) {
                var existingLogs = this.getLogs();
                var existingLogIds = {};
                existingLogs.forEach(function(l) { existingLogIds[l.id] = true; });
                data.logs.forEach(function(log) {
                    if (!existingLogIds[log.id]) {
                        existingLogs.push(log);
                    }
                });
                existingLogs.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
                this.saveLogs(existingLogs.slice(0, 200));
            }
        }
    }
};

// ============================================================================
// Icons (SVG components)
// ============================================================================

var Icons = {
    Folder: function() {
        return html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>`;
    },
    File: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
        </svg>`;
    },
    Check: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
        </svg>`;
    },
    X: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>`;
    },
    Plus: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>`;
    },
    Edit: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>`;
    },
    Trash: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>`;
    },
    Download: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>`;
    },
    Upload: function() {
        return html`<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>`;
    },
    AlertCircle: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>`;
    },
    CheckCircle: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`;
    },
    RefreshCw: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>`;
    },
    Save: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
        </svg>`;
    },
    Database: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
        </svg>`;
    },
    Archive: function() {
        return html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
            <line x1="10" y1="12" x2="14" y2="12"/>
        </svg>`;
    },
    Filter: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>`;
    },
    UploadFile: function() {
        return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>`;
    }
};

// ============================================================================
// Checksum Utilities
// ============================================================================

/**
 * Pure JS MD5 implementation (RFC 1321) for file:// contexts where crypto.subtle is unavailable.
 * @param {Uint8Array} bytes - Input data
 * @returns {string} - Hex MD5 hash
 */
function md5hex(bytes) {
    function F(x,y,z){return(x&y)|(~x&z)}
    function G(x,y,z){return(x&z)|(y&~z)}
    function H(x,y,z){return x^y^z}
    function I(x,y,z){return y^(x|~z)}
    function rotl(x,n){return(x<<n)|(x>>>(32-n))}
    function add(a,b){return(a+b)|0}

    var s=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
           5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
           4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
           6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    var K=new Uint32Array(64);
    for(var i=0;i<64;i++) K[i]=Math.floor(Math.abs(Math.sin(i+1))*0x100000000);

    var len=bytes.length;
    var padLen=((56-(len+1)%64)+64)%64;
    var msg=new Uint8Array(len+1+padLen+8);
    msg.set(bytes);
    msg[len]=0x80;
    var bitLenLo=(len*8)>>>0;
    var bitLenHi=Math.floor(len/0x20000000);
    for(var i=0;i<4;i++){msg[len+1+padLen+i]=(bitLenLo>>>(i*8))&0xff}
    for(var i=0;i<4;i++){msg[len+1+padLen+4+i]=(bitLenHi>>>(i*8))&0xff}

    var a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
    var view=new DataView(msg.buffer);

    for(var offset=0;offset<msg.length;offset+=64){
        var M=new Uint32Array(16);
        for(var j=0;j<16;j++) M[j]=view.getUint32(offset+j*4,true);
        var A=a0,B=b0,C=c0,D=d0;
        for(var i=0;i<64;i++){
            var f,g;
            if(i<16){f=F(B,C,D);g=i}
            else if(i<32){f=G(B,C,D);g=(5*i+1)%16}
            else if(i<48){f=H(B,C,D);g=(3*i+5)%16}
            else{f=I(B,C,D);g=(7*i)%16}
            f=add(add(add(f,A),K[i]),M[g]);
            A=D;D=C;C=B;B=add(B,rotl(f,s[i]));
        }
        a0=add(a0,A);b0=add(b0,B);c0=add(c0,C);d0=add(d0,D);
    }

    function toHex(v){var h='';for(var i=0;i<4;i++)h+=((v>>>(i*8))&0xff).toString(16).padStart(2,'0');return h}
    return toHex(a0)+toHex(b0)+toHex(c0)+toHex(d0);
}

/**
 * Compute file checksum. Uses crypto.subtle (SHA-256) when available, falls back to pure JS MD5.
 * @param {File} fileObj - File to hash
 * @returns {Promise<{checksum: string, checksumType: string}>}
 */
function computeFileChecksum(fileObj) {
    return fileObj.arrayBuffer().then(function(buffer) {
        if (window.crypto && window.crypto.subtle) {
            return crypto.subtle.digest('SHA-256', buffer).then(function(hash) {
                var arr = new Uint8Array(hash);
                var hex = '';
                for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
                return { checksum: hex, checksumType: 'SHA-256' };
            });
        }
        // Fallback: pure JS MD5 (for file:// in Chrome)
        var hex = md5hex(new Uint8Array(buffer));
        return { checksum: hex, checksumType: 'MD5' };
    }).catch(function(e) {
        console.warn('Checksum failed for', fileObj.name, e);
        return { checksum: '', checksumType: 'MD5' };
    });
}

// ============================================================================
// File System Utilities (Web API)
// ============================================================================

// Categorie di cartelle riconosciute (retrocompat archivia-lite + PND/ECO-MiC).
// La chiave è il nome cartella canonico in structure[]. Il match è "includes":
// la cartella reale può chiamarsi anche "tiff_master" o "TIFF" e viene presa.
var KNOWN_FOLDERS = [
    'dng', 'raw',                              // master conservazione
    'tiff', 'tif', 'master', 'calibrato',      // master tecnico
    'jpg', 'jpeg', 'png', 'derivato',          // derivati
    'icc'                                      // profili colore
];
// Cartelle ignorate (esistono ma non finiscono in fileSec del METS)
var IGNORED_FOLDERS = ['logs', 'log', 'mets', 'metadata'];

function classifyFolder(folderName) {
    var n = (folderName || '').toLowerCase();
    if (IGNORED_FOLDERS.some(function(f) { return n === f || n.indexOf(f) !== -1; })) return null;
    return KNOWN_FOLDERS.find(function(c) { return n === c || n.indexOf(c) !== -1; }) || null;
}

function readDirectoryEntry(entry) {
    var structure = {};
    var reader = entry.createReader();
    var allEntries = [];

    function readBatch() {
        return new Promise(function(resolve, reject) {
            reader.readEntries(resolve, reject);
        });
    }

    return (function loop() {
        return readBatch().then(function(batch) {
            if (batch.length > 0) {
                allEntries = allEntries.concat(Array.from(batch));
                return loop();
            }
            return allEntries;
        });
    })().then(function(entries) {
        var promises = entries.map(function(subEntry) {
            if (subEntry.isDirectory) {
                var category = classifyFolder(subEntry.name);
                if (category) {
                    return readFilesFromEntry(subEntry).then(function(files) {
                        structure[category] = files;
                    }).catch(function(err) {
                        console.warn('Error reading subfolder:', subEntry.name, err.message);
                    });
                }
            }
            return Promise.resolve();
        });
        return Promise.all(promises).then(function() { return structure; });
    });
}

function readFilesFromEntry(dirEntry) {
    var reader = dirEntry.createReader();
    var allEntries = [];

    function readBatch() {
        return new Promise(function(resolve, reject) {
            reader.readEntries(resolve, reject);
        });
    }

    return (function loop() {
        return readBatch().then(function(batch) {
            if (batch.length > 0) {
                allEntries = allEntries.concat(Array.from(batch));
                return loop();
            }
            return allEntries;
        });
    })().then(function(entries) {
        var promises = entries.filter(function(e) { return e.isFile; }).map(function(entry) {
            return new Promise(function(resolve) {
                try {
                    entry.file(function(file) {
                        computeFileChecksum(file).then(function(hash) {
                            resolve({ name: entry.name, size: file.size, type: file.type, checksum: hash.checksum, checksumType: hash.checksumType });
                        }).catch(function() {
                            resolve({ name: entry.name, size: file.size, type: file.type, checksum: '', checksumType: 'MD5' });
                        });
                    }, function(err) {
                        console.warn('Skipping file (read error):', entry.name, err.message);
                        resolve(null);
                    });
                } catch (e) {
                    console.warn('Skipping file (encoding error):', entry.name, e.message);
                    resolve(null);
                }
            });
        });
        return Promise.all(promises).then(function(files) {
            return files.filter(Boolean).sort(function(a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
        });
    });
}

function readDirectoryHandle(dirHandle) {
    var structure = {};

    return (async function() {
        for await (var entry of dirHandle.values()) {
            if (entry.kind === 'directory') {
                var category = classifyFolder(entry.name);
                if (category) {
                    try {
                        structure[category] = await readFilesFromHandle(entry);
                    } catch (err) {
                        console.warn('Error reading subfolder:', entry.name, err.message);
                    }
                }
            }
        }
        return structure;
    })();
}

function readFilesFromHandle(dirHandle) {
    return (async function() {
        var files = [];
        for await (var entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                try {
                    var file = await entry.getFile();
                    var hash = await computeFileChecksum(file);
                    files.push({ name: entry.name, size: file.size, type: file.type, checksum: hash.checksum, checksumType: hash.checksumType });
                } catch (err) {
                    console.warn('Skipping file:', entry.name, err.message);
                }
            }
        }
        return files.sort(function(a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
    })();
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ============================================================================
// Archive Form Component
// ============================================================================

function ArchiveForm(props) {
    var archive = props.archive;
    var onSave = props.onSave;
    var onCancel = props.onCancel;

    var ref = useState(archive || {
        code: '', name: '', project: '', contact: '',
        // Agenti METS (ECO-MiC 1.2)
        creatorName: '', ipOwnerName: '',
        // Identificazione Archivistica
        conservativeId: '', conservativeIdAuthority: 'ISIL',
        recordContentSource: '',
        producerName: '', physicalLocation: '',
        fundName: '', seriesName: '',
        // Diritti (ECO-MiC 1.2)
        rightsHolder: '', rightsHolderId: '', rightsHolderEmail: '',
        dctLicense: '', dctRights: '',
        // Attrezzatura di Digitalizzazione
        scannerManufacturer: '', scannerModel: '', scanningSoftware: '',
        imageProducer: '', defaultDpi: '300'
    });
    var formData = ref[0];
    var setFormData = ref[1];

    function handleChange(e) {
        var name = e.target.name;
        var value = e.target.value;
        setFormData(function(prev) { return Object.assign({}, prev, { [name]: value }); });
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!formData.code || !formData.name) {
            alert('Codice archivio e Nome sono obbligatori');
            return;
        }
        onSave(formData);
    }

    return html`<form onSubmit=${handleSubmit}>
        <div className="form-row">
            <div className="form-group">
                <label>Codice Archivio *</label>
                <input type="text" name="code" value=${formData.code} onChange=${handleChange} placeholder="es. IT-TO0879" required />
            </div>
            <div className="form-group">
                <label>Nome Archivio (Soggetto Conservatore) *</label>
                <input type="text" name="name" value=${formData.name} onChange=${handleChange} placeholder="es. Archivio di Stato di Torino" required />
            </div>
        </div>

        <h4 className="form-section-title">Agenti METS (ECO-MiC 1.2)</h4>

        <div className="form-row">
            <div className="form-group">
                <label>Ente Creatore (CREATOR)</label>
                <input type="text" name="creatorName" value=${formData.creatorName} onChange=${handleChange} placeholder="es. Ministero della Cultura" />
                <small style=${{ color: '#64748b' }}>Se vuoto, usa il Nome Archivio</small>
            </div>
            <div className="form-group">
                <label>Titolare IP (IPOWNER)</label>
                <input type="text" name="ipOwnerName" value=${formData.ipOwnerName} onChange=${handleChange} placeholder="es. Ministero della Cultura" />
                <small style=${{ color: '#64748b' }}>Se vuoto, usa l'Ente Creatore</small>
            </div>
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>Soggetto Produttore</label>
                <input type="text" name="producerName" value=${formData.producerName} onChange=${handleChange} placeholder="es. Monastero di San Colombano" />
                <small style=${{ color: '#64748b' }}>Ente/persona che ha prodotto il materiale archivistico</small>
            </div>
            <div className="form-group">
                <label>Progetto di Digitalizzazione</label>
                <input type="text" name="project" value=${formData.project} onChange=${handleChange} placeholder="es. Digitalizzazione Fondo XYZ" />
            </div>
        </div>

        <h4 className="form-section-title">Identificazione Archivistica</h4>

        <div className="form-row">
            <div className="form-group">
                <label>ID Conservativo (ISIL)</label>
                <input type="text" name="conservativeId" value=${formData.conservativeId} onChange=${handleChange} placeholder="es. IT-TO0879" />
            </div>
            <div className="form-group">
                <label>Authority</label>
                <input type="text" name="conservativeIdAuthority" value=${formData.conservativeIdAuthority} onChange=${handleChange} placeholder="es. ISIL" />
            </div>
        </div>

        <div className="form-group">
            <label>Record Content Source *</label>
            <input type="text" name="recordContentSource" value=${formData.recordContentSource} onChange=${handleChange} placeholder="es. SIA-ARC-005" />
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>Localizzazione Fisica</label>
                <input type="text" name="physicalLocation" value=${formData.physicalLocation} onChange=${handleChange} placeholder="es. Archivio di Stato di Torino" />
                <small style=${{ color: '#64748b' }}>Se vuoto, usa il Nome Archivio</small>
            </div>
            <div className="form-group">
                <label>Nome Fondo / Collezione</label>
                <input type="text" name="fundName" value=${formData.fundName} onChange=${handleChange} placeholder="es. Materie Ecclesiastiche" />
            </div>
        </div>

        <h4 className="form-section-title">Diritti (ECO-MiC 1.2)</h4>

        <div className="form-row">
            <div className="form-group">
                <label>Titolare Diritti</label>
                <input type="text" name="rightsHolder" value=${formData.rightsHolder} onChange=${handleChange} placeholder="es. Ministero della Cultura" />
            </div>
            <div className="form-group">
                <label>ID Titolare (RIGHTSHOLDERID)</label>
                <input type="text" name="rightsHolderId" value=${formData.rightsHolderId} onChange=${handleChange} placeholder="es. MiC" />
            </div>
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>Email Contatto Diritti</label>
                <input type="email" name="rightsHolderEmail" value=${formData.rightsHolderEmail} onChange=${handleChange} placeholder="es. as-to@cultura.gov.it" />
            </div>
            <div className="form-group">
                <label>Contatto Archivio</label>
                <input type="text" name="contact" value=${formData.contact} onChange=${handleChange} placeholder="email o telefono" />
            </div>
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>DCT License URL</label>
                <input type="url" name="dctLicense" value=${formData.dctLicense} onChange=${handleChange} placeholder="es. https://w3id.org/italia/controlled-vocabulary/licenses/B117_BCS" />
            </div>
            <div className="form-group">
                <label>DCT Rights URL</label>
                <input type="url" name="dctRights" value=${formData.dctRights} onChange=${handleChange} placeholder="es. http://rightsstatements.org/vocab/NoC-OKLR/1.0/" />
            </div>
        </div>

        <h4 className="form-section-title">Attrezzatura di Digitalizzazione</h4>

        <div className="form-row">
            <div className="form-group">
                <label>Produttore Immagini</label>
                <input type="text" name="imageProducer" value=${formData.imageProducer} onChange=${handleChange} placeholder="es. EDS Gamma" />
            </div>
            <div className="form-group">
                <label>DPI Predefinito</label>
                <input type="text" name="defaultDpi" value=${formData.defaultDpi} onChange=${handleChange} placeholder="es. 300" />
            </div>
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>Produttore Scanner/Fotocamera</label>
                <input type="text" name="scannerManufacturer" value=${formData.scannerManufacturer} onChange=${handleChange} placeholder="es. Metis Systems srl" />
            </div>
            <div className="form-group">
                <label>Modello</label>
                <input type="text" name="scannerModel" value=${formData.scannerModel} onChange=${handleChange} placeholder="es. METIS EDS Gamma" />
            </div>
        </div>

        <div className="form-group">
            <label>Software di Acquisizione</label>
            <input type="text" name="scanningSoftware" value=${formData.scanningSoftware} onChange=${handleChange} placeholder="es. Capture One, LIBFORMAT" />
        </div>

        <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick=${onCancel}>Annulla</button>
            <button type="submit" className="btn btn-primary"><${Icons.Check} /> Salva Archivio</button>
        </div>
    </form>`;
}

// ============================================================================
// Archive Manager Component
// ============================================================================

function ArchiveManager(props) {
    var archives = props.archives;
    var currentArchive = props.currentArchive;
    var onSelect = props.onSelect;
    var onAdd = props.onAdd;
    var onEdit = props.onEdit;
    var onDelete = props.onDelete;
    var onImport = props.onImport;
    var onExport = props.onExport;

    var ref = useState(false);
    var showForm = ref[0];
    var setShowForm = ref[1];

    var ref2 = useState(null);
    var editingArchive = ref2[0];
    var setEditingArchive = ref2[1];

    function handleSave(archiveData) {
        if (editingArchive) {
            onEdit(editingArchive.id, archiveData);
        } else {
            onAdd(archiveData);
        }
        setShowForm(false);
        setEditingArchive(null);
    }

    return html`<div>
        <div className="card">
            <div className="card-header">
                <h3 className="card-title"><${Icons.Archive} /> Gestione Archivi</h3>
                <button className="btn btn-primary" onClick=${function() { setEditingArchive(null); setShowForm(true); }}>
                    <${Icons.Plus} /> Nuovo Archivio
                </button>
            </div>

            ${archives.length === 0 ? html`
                <div className="alert alert-info">
                    <${Icons.AlertCircle} />
                    <span>Nessun archivio configurato. Crea un nuovo archivio per iniziare.</span>
                </div>
            ` : html`
                <div className="entity-list">
                    ${archives.map(function(archive) {
                        return html`<div
                            key=${archive.id}
                            className=${'entity-item' + (currentArchive && currentArchive.id === archive.id ? ' selected' : '')}
                            onClick=${function() { onSelect(archive); }}
                        >
                            <div className="entity-info">
                                <h3>${archive.code} - ${archive.name}</h3>
                                <p>
                                    ${archive.project && html`<span>${archive.project}</span>`}
                                    ${archive.fundName && html`<span> | Fondo: ${archive.fundName}</span>`}
                                </p>
                            </div>
                            <div className="entity-actions">
                                <button className="btn btn-secondary btn-sm" onClick=${function(e) { e.stopPropagation(); setEditingArchive(archive); setShowForm(true); }}>
                                    <${Icons.Edit} />
                                </button>
                                <button className="btn btn-danger btn-sm" onClick=${function(e) { e.stopPropagation(); onDelete(archive.id); }}>
                                    <${Icons.Trash} />
                                </button>
                            </div>
                        </div>`;
                    })}
                </div>
            `}

            ${showForm && html`
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>${editingArchive ? 'Modifica Archivio' : 'Nuovo Archivio'}</h2>
                            <button className="modal-close" onClick=${function() { setShowForm(false); }}>\u00D7</button>
                        </div>
                        <div className="modal-body">
                            <${ArchiveForm}
                                archive=${editingArchive}
                                onSave=${handleSave}
                                onCancel=${function() { setShowForm(false); }}
                            />
                        </div>
                    </div>
                </div>
            `}
        </div>

        <${ImportExportPanel} onImport=${onImport} onExport=${onExport} />
    </div>`;
}

// ============================================================================
// Import/Export Panel
// ============================================================================

function ImportExportPanel(props) {
    var onImport = props.onImport;
    var onExport = props.onExport;
    var fileInputRef = useRef(null);
    var ref = useState('merge');
    var importMode = ref[0];
    var setImportMode = ref[1];

    function handleFileSelect(e) {
        var file = e.target.files[0];
        if (!file) return;
        file.text().then(function(text) {
            try {
                var data = JSON.parse(text);
                onImport(data, importMode);
            } catch (error) {
                alert('Errore nel parsing del file JSON: ' + error.message);
            }
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    return html`<div className="card">
        <div className="card-header">
            <h3 className="card-title"><${Icons.Database} /> Import / Export Database</h3>
        </div>
        <div className="import-export-actions">
            <button className="btn btn-secondary" onClick=${onExport}>
                <${Icons.Download} /> Esporta Database (JSON)
            </button>
            <div style=${{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select value=${importMode} onChange=${function(e) { setImportMode(e.target.value); }} style=${{ width: 'auto', minWidth: '120px' }}>
                    <option value="merge">Unisci (merge)</option>
                    <option value="replace">Sostituisci tutto</option>
                </select>
                <button className="btn btn-secondary" onClick=${function() { fileInputRef.current && fileInputRef.current.click(); }}>
                    <${Icons.UploadFile} /> Importa JSON
                </button>
                <input ref=${fileInputRef} type="file" accept=".json" onChange=${handleFileSelect} style=${{ display: 'none' }} />
            </div>
        </div>
    </div>`;
}

// ============================================================================
// Folder Drop Zone Component
// ============================================================================

function FolderDropZone(props) {
    var onFolderLoaded = props.onFolderLoaded;
    var disabled = props.disabled;

    var ref = useState(false);
    var isDragOver = ref[0];
    var setIsDragOver = ref[1];

    var ref2 = useState(false);
    var loading = ref2[0];
    var setLoading = ref2[1];

    function handleDragOver(e) {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
    }

    function handleDragLeave() { setIsDragOver(false); }

    function handleDrop(e) {
        e.preventDefault();
        setIsDragOver(false);
        if (disabled) return;

        var items = e.dataTransfer.items;
        if (!items || items.length === 0) return;

        setLoading(true);
        var item = items[0];
        if (item.kind !== 'file') { setLoading(false); return; }

        // Parsing PND del nome cartella: ricava codice istituto e codice oggetto
        // se il nome è nella forma <CodiceIstituto>+<CodiceOggetto>.
        function enrichWithPndParse(payload) {
            var parsed = (window.METSGenerator && METSGenerator.parseFolderName)
                ? METSGenerator.parseFolderName(payload.name)
                : null;
            if (parsed) {
                payload.pndParsed = parsed;
            }
            return payload;
        }

        // Prefer modern File System Access API (no encoding bugs)
        if (item.getAsFileSystemHandle) {
            item.getAsFileSystemHandle().then(function(handle) {
                if (handle.kind === 'directory') {
                    return readDirectoryHandle(handle).then(function(structure) {
                        onFolderLoaded(enrichWithPndParse({ name: handle.name, structure: structure }));
                    });
                } else {
                    alert('Per favore trascina una cartella, non un file singolo.');
                }
            }).catch(function(error) {
                console.error('Error reading folder:', error);
                alert('Errore nella lettura della cartella: ' + error.message);
            }).finally(function() { setLoading(false); });
        } else {
            // Fallback: old webkitGetAsEntry API
            var entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
            if (entry && entry.isDirectory) {
                readDirectoryEntry(entry).then(function(structure) {
                    onFolderLoaded(enrichWithPndParse({ name: entry.name, structure: structure }));
                }).catch(function(error) {
                    console.error('Error reading folder:', error);
                    alert('Errore nella lettura della cartella: ' + error.message);
                }).finally(function() { setLoading(false); });
            } else {
                alert('Per favore trascina una cartella, non un file singolo.');
                setLoading(false);
            }
        }
    }

    function handleBrowse() {
        if (disabled) return;
        if ('showDirectoryPicker' in window) {
            window.showDirectoryPicker().then(function(dirHandle) {
                setLoading(true);
                return readDirectoryHandle(dirHandle).then(function(structure) {
                    var payload = { name: dirHandle.name, structure: structure };
                    var parsed = (window.METSGenerator && METSGenerator.parseFolderName)
                        ? METSGenerator.parseFolderName(dirHandle.name) : null;
                    if (parsed) payload.pndParsed = parsed;
                    onFolderLoaded(payload);
                });
            }).catch(function(error) {
                if (error.name !== 'AbortError') {
                    alert('Errore nella selezione della cartella: ' + error.message);
                }
            }).finally(function() { setLoading(false); });
        } else {
            alert("Il browser non supporta la selezione diretta di cartelle. Prova a trascinare la cartella nell'area.");
        }
    }

    return html`<div
        className=${'drop-zone' + (isDragOver ? ' dragover' : '')}
        onDragOver=${handleDragOver}
        onDragLeave=${handleDragLeave}
        onDrop=${handleDrop}
        onClick=${handleBrowse}
        style=${{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
        ${loading ? html`
            <div className="drop-zone-icon"><${Icons.RefreshCw} /></div>
            <div className="drop-zone-text">Lettura cartella in corso...</div>
        ` : html`
            <div className="drop-zone-icon"><${Icons.Upload} /></div>
            <div className="drop-zone-text">Trascina qui una cartella PND <span style=${{ color: '#64748b', fontWeight: 'normal' }}>(es. <code>IT-RMB576+PFR2_4/</code>)</span></div>
            <div className="drop-zone-hint">supportate anche cartelle Archivia Lite (master/calibrato/derivato/icc). Click per selezionare manualmente.</div>
        `}
    </div>`;
}

// ============================================================================
// Folder Structure Display
// ============================================================================

function FolderStructureDisplay(props) {
    var folderName = props.folderName;
    var structure = props.structure;

    // Mostro solo le categorie effettivamente presenti, in ordine canonico.
    // Aggiungo poi qualsiasi altra chiave non prevista.
    var preferredOrder = [
        { key: 'dng',       label: 'dng (master RAW)' },
        { key: 'tiff',      label: 'tiff (master TIFF)' },
        { key: 'jpg',       label: 'jpg (derivati JPEG)' },
        { key: 'master',    label: 'master (DNG/RAW)' },
        { key: 'calibrato', label: 'calibrato (TIFF)' },
        { key: 'derivato',  label: 'derivato (JPEG)' },
        { key: 'icc',       label: 'icc (profili colore)' }
    ];
    var presentKeys = Object.keys(structure || {});
    var categories = preferredOrder.filter(function(c) { return presentKeys.indexOf(c.key) !== -1; });
    presentKeys.forEach(function(k) {
        if (!categories.find(function(c) { return c.key === k; })) {
            categories.push({ key: k, label: k });
        }
    });

    var totalFiles = Object.values(structure).reduce(function(sum, files) { return sum + (files ? files.length : 0); }, 0);

    return html`<div className="card">
        <div className="card-header">
            <h3 className="card-title"><${Icons.Folder} /> ${folderName}</h3>
            <span className="file-count">${totalFiles} file totali</span>
        </div>
        <div className="folder-structure">
            ${categories.map(function(cat) {
                var files = structure[cat.key] || [];
                var hasFiles = files.length > 0;

                return html`<div key=${cat.key}>
                    <div className="folder-item">
                        <span className=${hasFiles ? 'check-icon' : 'missing-icon'}>
                            ${hasFiles ? html`<${Icons.CheckCircle} />` : html`<${Icons.X} />`}
                        </span>
                        <span className="folder-icon"><${Icons.Folder} /></span>
                        <span>${cat.label}/</span>
                        ${hasFiles && html`<span className="file-count">${files.length}</span>`}
                    </div>
                    ${hasFiles && files.slice(0, 3).map(function(file, idx) {
                        return html`<div key=${idx} className="folder-item indent-1">
                            <span className="file-icon"><${Icons.File} /></span>
                            <span>${file.name}</span>
                            <span style=${{ color: '#64748b', fontSize: '12px', marginLeft: 'auto' }}>${formatFileSize(file.size)}</span>
                        </div>`;
                    })}
                    ${files.length > 3 && html`
                        <div className="folder-item indent-1" style=${{ color: '#64748b' }}>... e altri ${files.length - 3} file</div>
                    `}
                </div>`;
            })}
        </div>
    </div>`;
}

// ============================================================================
// Document Metadata Form
// ============================================================================

function DocumentMetadataForm(props) {
    var folderNumber = props.folderNumber;
    var metadata = props.metadata;
    var onChange = props.onChange;

    function handleChange(e) {
        var name = e.target.name;
        var value = e.target.value;
        onChange(Object.assign({}, metadata, { [name]: value }));
    }

    return html`<div className="card">
        <div className="card-header">
            <h3 className="card-title">Metadati Documento</h3>
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>Numero Cartella</label>
                <input type="text" value=${folderNumber} disabled style=${{ background: '#f1f5f9' }} />
            </div>
            <div className="form-group">
                <label>Titolo *</label>
                <input type="text" name="title" value=${metadata.title || ''} onChange=${handleChange} placeholder="Titolo del documento" required />
            </div>
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>Data Inizio</label>
                <input type="text" name="dateFrom" value=${metadata.dateFrom || ''} onChange=${handleChange} placeholder="YYYY-MM-DD o YYYY" />
            </div>
            <div className="form-group">
                <label>Data Fine</label>
                <input type="text" name="dateTo" value=${metadata.dateTo || ''} onChange=${handleChange} placeholder="YYYY-MM-DD o YYYY" />
            </div>
            <div className="form-group">
                <label>Periodo</label>
                <input type="text" name="period" value=${metadata.period || ''} onChange=${handleChange} placeholder="es. XVIII secolo" />
            </div>
        </div>

        <div className="form-group">
            <label>Descrizione</label>
            <textarea name="description" value=${metadata.description || ''} onChange=${handleChange} placeholder="Descrizione del contenuto del documento" />
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>Tipo di Risorsa</label>
                <select name="typeOfResource" value=${metadata.typeOfResource || 'documento testuale'} onChange=${handleChange}>
                    <option value="documento testuale">documento testuale</option>
                    <option value="risorsa manoscritta">risorsa manoscritta</option>
                    <option value="risorsa cartografica">risorsa cartografica</option>
                    <option value="risorsa iconografica">risorsa iconografica</option>
                    <option value="risorsa musicale">risorsa musicale</option>
                    <option value="registrazione sonora">registrazione sonora</option>
                    <option value="immagine in movimento">immagine in movimento</option>
                    <option value="risorsa tridimensionale">risorsa tridimensionale</option>
                </select>
            </div>
            <div className="form-group">
                <label>Numero Pagine</label>
                <input type="number" name="totalPages" value=${metadata.totalPages || ''} onChange=${handleChange} min="1" />
            </div>
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>Forma Fisica</label>
                <input type="text" name="physicalForm" value=${metadata.physicalForm || ''} onChange=${handleChange} placeholder="es. fascicolo, volume" />
            </div>
            <div className="form-group">
                <label>Estensione</label>
                <input type="text" name="extentDescription" value=${metadata.extentDescription || ''} onChange=${handleChange} placeholder="es. c. 14 nel fascicolo" />
            </div>
        </div>

        <div className="form-group">
            <label>Nomi di Persona (separati da virgola)</label>
            <input type="text" name="personalNames" value=${metadata.personalNames || ''} onChange=${handleChange} placeholder="es. Jeronimus Bellanus, Giovanni Rossi" />
        </div>

        <div className="form-row">
            <div className="form-group">
                <label>Stato Record (METS)</label>
                <select name="recordStatus" value=${metadata.recordStatus || 'COMPLETE'} onChange=${handleChange}>
                    <option value="COMPLETE">COMPLETE</option>
                    <option value="MINIMUM">MINIMUM</option>
                </select>
            </div>
            <div className="form-group">
                <label>Etichetta Pagina</label>
                <input type="text" name="pageLabel" value=${metadata.pageLabel || ''} onChange=${handleChange} placeholder="es. Carta (default: Carta)" />
                <small style=${{ color: '#64748b' }}>Usato nello structMap: "Carta 1", "Carta 2"...</small>
            </div>
        </div>
    </div>`;
}

// ============================================================================
// XML Preview Component
// ============================================================================

function XmlPreview(props) {
    var xmlStr = props.xml;
    var onValidate = props.onValidate;
    var validationResult = props.validationResult;
    var isValidating = props.isValidating;

    var highlightedXml = useMemo(function() { return METSGenerator.highlightXml(xmlStr); }, [xmlStr]);

    return html`<div className="card">
        <div className="card-header">
            <h3 className="card-title">Preview XML METS</h3>
            <button className="btn btn-secondary" onClick=${onValidate} disabled=${isValidating}>
                ${isValidating ? html`<${Icons.RefreshCw} />` : html`<${Icons.Check} />`}
                ${isValidating ? ' Validazione...' : ' Valida METS'}
            </button>
        </div>

        <pre className="xml-preview" dangerouslySetInnerHTML=${{ __html: highlightedXml }} />

        ${validationResult && html`
            <div className=${'validation-result ' + validationResult.status}>
                <strong>${validationResult.title}</strong>
                <p>${validationResult.message}</p>
                ${validationResult.details && validationResult.details.length > 0 && html`
                    <div className="validation-errors">
                        ${validationResult.details.map(function(err, idx) {
                            return html`<div key=${idx} className="validation-error-item">
                                <strong>[${err.id}] ${err.severity.toUpperCase()}</strong>
                                <p>${err.message}</p>
                                ${err.tag && html`<small>Tag: ${err.tag}</small>`}
                                ${err.line && html`<small> | ${err.line}</small>`}
                            </div>`;
                        })}
                    </div>
                `}
            </div>
        `}
    </div>`;
}

// ============================================================================
// Log Viewer Component (with archive filter)
// ============================================================================

function LogViewer(props) {
    var logs = props.logs;
    var archives = props.archives;
    var onClear = props.onClear;

    var ref = useState('');
    var filterArchive = ref[0];
    var setFilterArchive = ref[1];

    var filteredLogs = useMemo(function() {
        if (!filterArchive) return logs;
        return logs.filter(function(l) { return l.archiveCode === filterArchive; });
    }, [logs, filterArchive]);

    function statusLabel(status) {
        switch (status) {
            case 'success': return 'Completato';
            case 'error': return 'Errore';
            case 'warning': return 'Avviso';
            case 'info': return 'Info';
            default: return status;
        }
    }

    return html`<div className="card">
        <div className="card-header">
            <h3 className="card-title"><${Icons.Database} /> Log Operazioni</h3>
            <div style=${{ display: 'flex', gap: '8px' }}>
                ${logs.length > 0 && html`
                    <button className="btn btn-secondary btn-sm" onClick=${onClear}>
                        <${Icons.Trash} /> Pulisci Log
                    </button>
                `}
            </div>
        </div>

        ${logs.length > 0 && archives.length > 0 && html`
            <div className="log-filter">
                <${Icons.Filter} />
                <select value=${filterArchive} onChange=${function(e) { setFilterArchive(e.target.value); }}>
                    <option value="">Tutti gli archivi</option>
                    ${archives.map(function(a) {
                        return html`<option key=${a.id} value=${a.code}>${a.code} - ${a.name}</option>`;
                    })}
                </select>
            </div>
        `}

        ${filteredLogs.length === 0 ? html`
            <div className="alert alert-info">
                <${Icons.AlertCircle} />
                <span>${logs.length === 0 ? 'Nessuna operazione registrata.' : "Nessun log per l'archivio selezionato."}</span>
            </div>
        ` : html`
            <table className="log-table">
                <thead>
                    <tr>
                        <th>Data/Ora</th>
                        <th>Cartella</th>
                        <th>Archivio</th>
                        <th>Stato</th>
                        <th>Messaggio</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredLogs.map(function(entry) {
                        return html`<tr key=${entry.id}>
                            <td>${new Date(entry.timestamp).toLocaleString('it-IT')}</td>
                            <td>${entry.folderName || '-'}</td>
                            <td>${entry.archiveCode || '-'}</td>
                            <td>
                                <span className=${'status-badge ' + entry.status}>${statusLabel(entry.status)}</span>
                            </td>
                            <td>${entry.message}</td>
                        </tr>`;
                    })}
                </tbody>
            </table>
        `}
    </div>`;
}

// ============================================================================
// Main App Component
// ============================================================================

function App() {
    var ref1 = useState('generate');
    var activeTab = ref1[0];
    var setActiveTab = ref1[1];

    var ref2 = useState([]);
    var archives = ref2[0];
    var setArchives = ref2[1];

    var ref3 = useState(null);
    var currentArchive = ref3[0];
    var setCurrentArchive = ref3[1];

    var ref4 = useState([]);
    var logs = ref4[0];
    var setLogs = ref4[1];

    var ref5 = useState(null);
    var loadedFolder = ref5[0];
    var setLoadedFolder = ref5[1];

    var ref6 = useState({});
    var documentMetadata = ref6[0];
    var setDocumentMetadata = ref6[1];

    var ref7 = useState('');
    var generatedXml = ref7[0];
    var setGeneratedXml = ref7[1];

    var ref8 = useState(null);
    var validationResult = ref8[0];
    var setValidationResult = ref8[1];

    var ref9 = useState(false);
    var isValidating = ref9[0];
    var setIsValidating = ref9[1];

    // Load data on mount
    useEffect(function() {
        var loadedArchives = Storage.getArchives();
        setArchives(loadedArchives);

        var currentArchiveId = Storage.getSetting('currentArchiveId');
        if (currentArchiveId) {
            var archive = loadedArchives.find(function(a) { return a.id === currentArchiveId; });
            if (archive) setCurrentArchive(archive);
        }

        setLogs(Storage.getLogs());
    }, []);

    // Archive handlers
    function handleAddArchive(archiveData) {
        var newArchive = Storage.createArchive(archiveData);
        setArchives(Storage.getArchives());
        setCurrentArchive(newArchive);
        Storage.setSetting('currentArchiveId', newArchive.id);
    }

    function handleEditArchive(id, archiveData) {
        var updated = Storage.updateArchive(id, archiveData);
        setArchives(Storage.getArchives());
        if (currentArchive && currentArchive.id === id) {
            setCurrentArchive(updated);
        }
    }

    function handleDeleteArchive(id) {
        if (!confirm('Sei sicuro di voler eliminare questo archivio?')) return;
        Storage.deleteArchive(id);
        setArchives(Storage.getArchives());
        if (currentArchive && currentArchive.id === id) {
            setCurrentArchive(null);
            Storage.setSetting('currentArchiveId', null);
        }
    }

    function handleSelectArchive(archive) {
        setCurrentArchive(archive);
        Storage.setSetting('currentArchiveId', archive.id);
    }

    function handleFolderLoaded(folder) {
        setLoadedFolder(folder);
        // Pre-popola i metadati documento usando il parser PND del nome cartella:
        //   <CodiceIstituto>+<CodiceOggetto>  →  codice oggetto = folderNumber, logicalId = codice oggetto
        // Se il nome non è PND-conforme, fallback al nome cartella intero (vecchio comportamento).
        var initialMeta = { folderNumber: folder.name };
        if (folder.pndParsed) {
            initialMeta.folderNumber = folder.pndParsed.codiceOggetto;
            initialMeta.logicalId = folder.pndParsed.codiceOggetto;
            initialMeta.codiceIstituto = folder.pndParsed.codiceIstituto;
            initialMeta.codiceOggetto = folder.pndParsed.codiceOggetto;
        }
        setDocumentMetadata(initialMeta);
        setGeneratedXml('');
        setValidationResult(null);
    }

    // Generate XML
    var handleGenerateXml = useCallback(function() {
        if (!currentArchive || !loadedFolder) return;
        // Costruisci document override:
        //  - se cartella PND parsata, usa codiceOggetto come logicalId (override su entity.code+folderNumber)
        var docOverride = Object.assign({}, documentMetadata, { folderNumber: loadedFolder.name });
        if (loadedFolder.pndParsed) {
            docOverride.logicalId = loadedFolder.pndParsed.codiceOggetto;
        }
        var xml = METSGenerator.generate(currentArchive, docOverride, loadedFolder.structure);
        setGeneratedXml(xml);
        setValidationResult(null);
    }, [currentArchive, loadedFolder, documentMetadata]);

    // Auto-generate XML when metadata changes
    useEffect(function() {
        if (currentArchive && loadedFolder && documentMetadata.title) {
            handleGenerateXml();
        }
    }, [currentArchive, loadedFolder, documentMetadata, handleGenerateXml]);

    // Validate XML
    function handleValidate() {
        if (!generatedXml) return;
        setIsValidating(true);
        setValidationResult(null);

        var filename = currentArchive.code + '_' + loadedFolder.name + '_mets.xml';
        METSValidator.validate(generatedXml, filename).then(function(result) {
            setValidationResult(METSValidator.formatResult(result));
        }).catch(function(error) {
            setValidationResult({ status: 'error', title: 'Errore di validazione', message: error.message, details: null });
        }).finally(function() {
            setIsValidating(false);
        });
    }

    // Export XML
    function handleExportXml() {
        if (!generatedXml || !currentArchive || !loadedFolder) return;

        var filename = currentArchive.code + '_' + loadedFolder.name + '_mets.xml';
        var blob = new Blob([generatedXml], { type: 'application/xml' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        Storage.addLog({
            folderName: loadedFolder.name,
            archiveCode: currentArchive.code,
            status: 'success',
            message: 'File ' + filename + ' esportato con successo'
        });
        setLogs(Storage.getLogs());
    }

    // Export database JSON
    function handleExportDatabase() {
        var data = Storage.exportData();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'filza-export-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);

        Storage.addLog({
            archiveCode: currentArchive ? currentArchive.code : '-',
            status: 'info',
            message: 'Database esportato in formato JSON'
        });
        setLogs(Storage.getLogs());
    }

    // Import database JSON
    function handleImportDatabase(data, mode) {
        try {
            Storage.importData(data, mode);
            setArchives(Storage.getArchives());
            setLogs(Storage.getLogs());

            var currentId = Storage.getSetting('currentArchiveId');
            if (currentId) {
                var archive = Storage.getArchive(currentId);
                setCurrentArchive(archive);
            }

            var count = data.archives ? data.archives.length : 0;
            alert('Import completato: ' + count + ' archivi elaborati (modalita: ' + mode + ').');

            Storage.addLog({
                archiveCode: '-',
                status: 'info',
                message: 'Database importato (' + mode + '): ' + count + ' archivi'
            });
            setLogs(Storage.getLogs());
        } catch (error) {
            alert("Errore durante l'importazione: " + error.message);
        }
    }

    function handleClearLogs() {
        if (!confirm('Sei sicuro di voler cancellare tutto il log?')) return;
        Storage.clearLogs();
        setLogs([]);
    }

    function handleReset() {
        setLoadedFolder(null);
        setDocumentMetadata({});
        setGeneratedXml('');
        setValidationResult(null);
    }

    var workflowSteps = [
        { number: 1, title: 'Seleziona Archivio', description: "Scegli l'archivio", completed: !!currentArchive, active: !currentArchive },
        { number: 2, title: 'Carica Cartella', description: 'Trascina la cartella', completed: !!loadedFolder, active: !!currentArchive && !loadedFolder },
        { number: 3, title: 'Compila Metadati', description: 'Inserisci i dati', completed: !!documentMetadata.title, active: !!loadedFolder && !documentMetadata.title },
        { number: 4, title: 'Esporta', description: 'Genera e scarica', completed: false, active: !!generatedXml }
    ];

    return html`<div className="app-container">
        <header className="header">
            <h1>${APP_NAME} <span style=${{ fontSize: '14px', color: '#64748b', fontWeight: 'normal' }}>${APP_TAGLINE} · v${APP_VERSION}</span></h1>
            <div className="header-actions">
                ${currentArchive && html`
                    <span style=${{ color: '#64748b', fontSize: '14px' }}>
                        Archivio: <strong>${currentArchive.code}</strong>
                    </span>
                `}
            </div>
        </header>

        <div className="tabs">
            <button className=${'tab' + (activeTab === 'generate' ? ' active' : '')} onClick=${function() { setActiveTab('generate'); }}>
                Genera METS
            </button>
            <button className=${'tab' + (activeTab === 'archives' ? ' active' : '')} onClick=${function() { setActiveTab('archives'); }}>
                Gestione Archivi
            </button>
            <button className=${'tab' + (activeTab === 'log' ? ' active' : '')} onClick=${function() { setActiveTab('log'); }}>
                Log (${logs.length})
            </button>
        </div>

        ${activeTab === 'generate' && html`<${Fragment}>
            <div className="workflow-steps">
                ${workflowSteps.map(function(step) {
                    return html`<div key=${step.number} className=${'workflow-step' + (step.active ? ' active' : '') + (step.completed ? ' completed' : '')}>
                        <div className="step-number">${step.completed ? html`<${Icons.Check} />` : step.number}</div>
                        <div className="step-info">
                            <h4>${step.title}</h4>
                            <p>${step.description}</p>
                        </div>
                    </div>`;
                })}
            </div>

            ${!currentArchive && html`
                <div className="alert alert-warning">
                    <${Icons.AlertCircle} />
                    <span>
                        Seleziona un archivio dalla tab "Gestione Archivi" prima di procedere.
                        ${archives.length === 0 ? ' Devi prima creare almeno un archivio.' : ''}
                    </span>
                </div>
            `}

            ${currentArchive && html`<${Fragment}>
                ${!loadedFolder ? html`
                    <${FolderDropZone} onFolderLoaded=${handleFolderLoaded} disabled=${!currentArchive} />
                ` : html`<${Fragment}>
                    <div style=${{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                        <button className="btn btn-secondary" onClick=${handleReset}>
                            <${Icons.RefreshCw} /> Nuova Cartella
                        </button>
                    </div>

                    <div className="two-col-layout">
                        <div>
                            <${FolderStructureDisplay} folderName=${loadedFolder.name} structure=${loadedFolder.structure} />
                            <${DocumentMetadataForm} folderNumber=${loadedFolder.name} metadata=${documentMetadata} onChange=${setDocumentMetadata} />
                        </div>
                        <div className="preview-column">
                            ${generatedXml && html`<${Fragment}>
                                <${XmlPreview}
                                    xml=${generatedXml}
                                    onValidate=${handleValidate}
                                    validationResult=${validationResult}
                                    isValidating=${isValidating}
                                />
                                <div style=${{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button className="btn btn-success" onClick=${handleExportXml}>
                                        <${Icons.Download} /> Esporta XML
                                    </button>
                                </div>
                            <//>`}
                        </div>
                    </div>
                <//>`}
            <//>`}
        <//>`}

        ${activeTab === 'archives' && html`
            <${ArchiveManager}
                archives=${archives}
                currentArchive=${currentArchive}
                onSelect=${handleSelectArchive}
                onAdd=${handleAddArchive}
                onEdit=${handleEditArchive}
                onDelete=${handleDeleteArchive}
                onImport=${handleImportDatabase}
                onExport=${handleExportDatabase}
            />
        `}

        ${activeTab === 'log' && html`
            <${LogViewer} logs=${logs} archives=${archives} onClear=${handleClearLogs} />
        `}
    </div>`;
}

// Mount the app
ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
