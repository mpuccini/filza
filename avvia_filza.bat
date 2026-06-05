@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

set PORT=8080
set "DIR=%~dp0"

echo.
echo  +----------------------------------------------+
echo  ^|    Filza — Generatore METS ECO-MiC 1.2      ^|
echo  +----------------------------------------------+
echo.

:: ── 1. Controlla se la porta e' gia' in uso ──────────────────────────────────
netstat -ano | findstr ":%PORT% " >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo  La porta %PORT% e' gia' in uso.
    echo  Probabilmente Filza e' gia' in esecuzione.
    echo.
    goto :apri_browser
)

:: ── 2. Prova Python (se installato) ─────────────────────────────────────────
where python >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo  Avvio server con Python ...
    start "Filza Server — chiudi questa finestra per fermare" /min ^
        python -m http.server %PORT% --directory "%DIR%"
    goto :attendi_server
)

where py >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo  Avvio server con Python ...
    start "Filza Server — chiudi questa finestra per fermare" /min ^
        py -m http.server %PORT% --directory "%DIR%"
    goto :attendi_server
)

:: ── 3. Fallback: PowerShell (sempre disponibile su Windows 10/11) ────────────
echo  Avvio server con PowerShell ...
start "Filza Server — chiudi questa finestra per fermare" /min ^
    powershell -ExecutionPolicy Bypass -NoExit -File "%DIR%filza_server.ps1" ^
    -Port %PORT% -RootPath "%DIR%"

:attendi_server
echo  Attendo avvio server ...
timeout /t 2 /nobreak >nul

:apri_browser
:: ── 4. Apri il browser (Edge → Chrome → browser predefinito) ────────────────
echo  Apertura browser ...

:: Edge (sempre su Windows 10/11)
set EDGE1=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
set EDGE2=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe

if exist "%EDGE1%" (
    start "" "%EDGE1%" "http://localhost:%PORT%/"
    goto :fatto
)
if exist "%EDGE2%" (
    start "" "%EDGE2%" "http://localhost:%PORT%/"
    goto :fatto
)

:: Chrome
set CHROME1=%ProgramFiles%\Google\Chrome\Application\chrome.exe
set CHROME2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
set CHROME3=%LocalAppData%\Google\Chrome\Application\chrome.exe

if exist "%CHROME1%" ( start "" "%CHROME1%" "http://localhost:%PORT%/" & goto :fatto )
if exist "%CHROME2%" ( start "" "%CHROME2%" "http://localhost:%PORT%/" & goto :fatto )
if exist "%CHROME3%" ( start "" "%CHROME3%" "http://localhost:%PORT%/" & goto :fatto )

:: Browser predefinito (fallback)
start "" "http://localhost:%PORT%/"

:fatto
echo.
echo  Filza e' in esecuzione su: http://localhost:%PORT%/
echo.
echo  NOTA: usa Microsoft Edge o Google Chrome.
echo        Firefox e altri browser non supportano l'accesso alle cartelle.
echo.
echo  Per fermare il server:
echo    - Chiudi la finestra "Filza Server" nella barra delle applicazioni
echo    - Oppure premi Ctrl+C qui e poi digita S
echo.
pause
