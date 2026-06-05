/**
 * METS ECO-MiC Validator
 * Client for Cineca validation API (ECO-MiC 1.2)
 */

const METSValidator = {
    // Cineca validation API endpoint
    apiUrl: 'https://validavmetsecomic.prod.os01.ocp.cineca.it/api/v1/checkmetsecomic/files',

    // CORS proxies for browser requests (tried in order)
    corsProxies: [
        { url: 'https://corsproxy.io/?', encode: true },
        { url: 'https://corsproxy.io/', encode: false }
    ],

    /**
     * Validate METS XML against ECO-MiC standard
     * @param {string} xmlContent - The METS XML content to validate
     * @param {string} filename - Filename for the validation request
     * @returns {Promise<Object>} - Validation result
     */
    async validate(xmlContent, filename = 'document_mets.xml') {
        try {
            // Detect file:// origin - skip direct request (always fails with CORS)
            var isFileOrigin = (window.location.protocol === 'file:' || window.location.origin === 'null');

            var result = null;

            if (!isFileOrigin) {
                // Try direct request (only works when served from http/https)
                result = await this._tryValidate(this.apiUrl, xmlContent, filename);
                if (!result.corsError) return result;
            }

            // Try CORS proxies
            for (var i = 0; i < this.corsProxies.length; i++) {
                var proxy = this.corsProxies[i];
                var proxyUrl = proxy.encode
                    ? proxy.url + encodeURIComponent(this.apiUrl)
                    : proxy.url + this.apiUrl;

                console.log('Trying CORS proxy:', proxyUrl.substring(0, 60) + '...');

                try {
                    result = await this._tryValidate(proxyUrl, xmlContent, filename, true);
                    if (!result.corsError) {
                        console.log('Proxy succeeded');
                        return result;
                    }
                    console.warn('Proxy returned CORS error:', proxy.url);
                } catch (e) {
                    console.warn('Proxy failed:', proxy.url, e.message);
                }
            }

            // All proxies failed - provide clear message
            return {
                success: false,
                valid: false,
                errorType: 'cors',
                message: 'Impossibile contattare l\'API Cineca dal browser. ' +
                    'Da file:// le richieste cross-origin sono bloccate. ' +
                    'Opzioni: (1) Usa la versione Electron, (2) Avvia un server locale ' +
                    '(es. python3 -m http.server), (3) Controlla la tab Network (F12) per la risposta grezza.'
            };
        } catch (error) {
            return {
                success: false,
                valid: false,
                errorType: 'network',
                message: 'Errore di rete: ' + error.message
            };
        }
    },

    async _tryValidate(url, xmlContent, filename, useProxy) {
        try {
            // Create form data
            var formData = new FormData();
            var blob = new Blob([xmlContent], { type: 'application/xml' });
            formData.append('files', blob, filename);

            var response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            // Read response as text first, then try JSON parse
            var text = await response.text();

            var data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                // Not JSON - check if it's a CORS/opaque issue
                if (response.status === 0 || response.type === 'opaque') {
                    return { corsError: true };
                }
                return {
                    success: false,
                    valid: false,
                    error: 'HTTP ' + response.status,
                    message: 'Risposta non valida dal server (HTTP ' + response.status + '): ' + text.substring(0, 200)
                };
            }

            // Parse the JSON response (handles all status codes uniformly)
            return this._parseResponse(data, response.status);
        } catch (error) {
            // Any fetch error from CORS/network - treat as CORS error
            console.warn('Fetch error:', error.name, error.message);
            return { corsError: true };
        }
    },

    /**
     * Unified response parser - extracts errors from any API response
     */
    _parseResponse(data, httpStatus) {
        var errors = [];

        if (data.filesResponse && Array.isArray(data.filesResponse)) {
            for (var i = 0; i < data.filesResponse.length; i++) {
                var fileResp = data.filesResponse[i];
                if (fileResp.listaMessaggi && Array.isArray(fileResp.listaMessaggi)) {
                    for (var j = 0; j < fileResp.listaMessaggi.length; j++) {
                        var msg = fileResp.listaMessaggi[j];
                        errors.push({
                            id: msg.idErrore,
                            type: msg.tipologiaErrore || 'ERROR',
                            description: msg.descrizioneErrore,
                            tag: msg.tagCoinvolto,
                            location: msg.fileLocationDetail
                        });
                    }
                }
            }
        }

        if (data.esito === true && errors.length === 0) {
            return {
                success: true,
                valid: true,
                message: 'Il documento METS e\' valido secondo lo standard ECO-MiC',
                rawResponse: data
            };
        }

        return {
            success: true,
            valid: false,
            message: errors.length > 0
                ? 'Validazione fallita: ' + errors.length + ' errore/i trovato/i'
                : (data.nomeCheck || 'Validazione fallita'),
            errors: errors,
            checkName: data.nomeCheck || null,
            rawResponse: data
        };
    },

    /**
     * Format validation result for display
     * @param {Object} result - Validation result
     * @returns {Object} - Formatted result for UI
     */
    formatResult(result) {
        if (!result.success) {
            return {
                status: 'error',
                title: 'Errore di comunicazione con il servizio',
                message: result.message || result.error,
                details: null
            };
        }

        if (result.valid) {
            return {
                status: 'success',
                title: 'Validazione completata',
                message: result.message,
                details: null
            };
        }

        // Format errors for display
        var errorDetails = (result.errors || []).map(function(err) {
            return {
                id: err.id,
                severity: (err.type || 'ERROR').toUpperCase() === 'ERROR' ? 'error' : 'warning',
                message: err.description,
                tag: err.tag,
                line: err.location
            };
        });

        return {
            status: 'invalid',
            title: result.checkName || 'Documento non valido',
            message: result.message,
            details: errorDetails
        };
    },

    /**
     * Mock validation for offline/testing
     * @param {string} xmlContent - XML content
     * @returns {Object} - Mock validation result
     */
    mockValidate(xmlContent) {
        var errors = [];

        if (!xmlContent.includes('<mets:mets')) {
            errors.push({ id: 1, type: 'ERROR', description: 'Elemento root mets:mets mancante', tag: '<mets:mets>', location: 'Line 1' });
        }
        if (!xmlContent.includes('<mets:dmdSec')) {
            errors.push({ id: 2, type: 'ERROR', description: 'Sezione dmdSec mancante', tag: '<mets:dmdSec>', location: '' });
        }
        if (!xmlContent.includes('type="logicalId"')) {
            errors.push({ id: 3, type: 'ERROR', description: 'Identificatore logicalId mancante', tag: '<mods:identifier>', location: '' });
        }
        if (!xmlContent.includes('type="relationId"')) {
            errors.push({ id: 4, type: 'ERROR', description: 'Identificatore relationId mancante', tag: '<mods:identifier>', location: '' });
        }
        if (!xmlContent.includes('<mets:structMap TYPE="PHYSICAL"')) {
            errors.push({ id: 5, type: 'ERROR', description: 'structMap TYPE="PHYSICAL" mancante', tag: '<mets:structMap>', location: '' });
        }
        if (!xmlContent.includes('MDTYPE="NISOIMG"')) {
            errors.push({ id: 6, type: 'ERROR', description: 'techMD con MDTYPE="NISOIMG" mancante', tag: '<mets:techMD>', location: '' });
        }
        if (!xmlContent.includes('RightsDeclarationMD')) {
            errors.push({ id: 7, type: 'ERROR', description: 'RightsDeclarationMD mancante', tag: '<metsrights:RightsDeclarationMD>', location: '' });
        }

        if (errors.length === 0) {
            return { success: true, valid: true, message: '[MOCK] Il documento METS sembra strutturalmente valido', mock: true };
        }

        return {
            success: true,
            valid: false,
            message: '[MOCK] Validazione locale: ' + errors.length + ' problemi trovati',
            errors: errors,
            mock: true
        };
    }
};

// Export for use in browser
if (typeof window !== 'undefined') {
    window.METSValidator = METSValidator;
}
