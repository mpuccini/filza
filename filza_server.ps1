# filza_server.ps1
# Mini server HTTP per servire Filza localmente.
# Usato da avvia_filza.bat come fallback quando Python non e' installato.
# Richiede: Windows 10/11 con PowerShell 5.1+ (preinstallato).

param(
    [string]$Port     = '8080',
    [string]$RootPath = $PSScriptRoot
)

# Tipi MIME essenziali
$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.xml'  = 'application/xml; charset=utf-8'
    '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    '.csv'  = 'text/csv; charset=utf-8'
    '.ico'  = 'image/x-icon'
    '.png'  = 'image/png'
    '.svg'  = 'image/svg+xml'
    '.txt'  = 'text/plain; charset=utf-8'
}

$url = "http://localhost:$Port/"

try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($url)
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host " ERRORE: impossibile avviare il server sulla porta $Port."
    Write-Host " Causa: $($_.Exception.Message)"
    Write-Host ""
    Write-Host " Soluzioni:"
    Write-Host "   1. Installa Python da: https://apps.microsoft.com/store/detail/python-312/9NCVDN91XZQP"
    Write-Host "   2. Oppure cambia la porta modificando avvia_filza.bat (riga: set PORT=8080)"
    Write-Host ""
    Read-Host " Premi Invio per chiudere"
    exit 1
}

Write-Host ""
Write-Host " Filza Server attivo su $url"
Write-Host " Chiudi questa finestra per fermare il server."
Write-Host ""

try {
    while ($listener.IsListening) {
        $ctx  = $listener.GetContext()
        $req  = $ctx.Request
        $resp = $ctx.Response

        $urlPath = $req.Url.LocalPath
        if ($urlPath -eq '/' -or $urlPath -eq '') { $urlPath = '/index.html' }

        # Sicurezza: impedisci path traversal (../)
        $safePath = $urlPath.TrimStart('/') -replace '\.\.', ''
        $safePath = $safePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $filePath = Join-Path $RootPath $safePath

        if ((Test-Path $filePath -PathType Leaf) -and ($filePath.StartsWith($RootPath))) {
            $ext   = [System.IO.Path]::GetExtension($filePath).ToLower()
            $ct    = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)

            $resp.StatusCode      = 200
            $resp.ContentType     = $ct
            $resp.ContentLength64 = $bytes.Length
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $msg  = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $resp.StatusCode      = 404
            $resp.ContentLength64 = $msg.Length
            $resp.OutputStream.Write($msg, 0, $msg.Length)
        }
        $resp.Close()
    }
} finally {
    $listener.Stop()
    Write-Host " Server fermato."
}
