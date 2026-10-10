; Hook dell'installer NSIS di Orbit (tauri.conf.json → bundle.windows.nsis.installerHooks).
;
; Associazioni dei file (M60): Orbit compare in "Apri con" per i file di testo, codice, immagini e PDF, ma
; NON ne diventa il programma predefinito. Prima le dichiarava `bundle.fileAssociations`, e l'installer di
; Tauri non si limita ad "Apri con": rende Orbit il gestore PREDEFINITO dell'estensione
; (HKCU\Software\Classes\.ext = "Orbit document", il valore precedente in "Orbit document_backup"), così il
; doppio clic su un .py o un .js apriva Orbit invece di quello che faceva prima. Ora fileAssociations su
; Windows è tolto (tauri.windows.conf.json) e la registrazione la fa questo file:
;   - OpenWithProgids dell'estensione → "Orbit document": Orbit è tra i programmi proposti;
;   - il ProgID "Orbit document" (icona, comando) resta con lo stesso nome, così le scelte "usa sempre
;     Orbit" già fatte dall'utente in "Apri con" continuano a funzionare;
;   - dove il predefinito è ancora quello messo da un Orbit precedente lo si restituisce: il valore salvato
;     nel backup, altrimenti nessuno (vale quello di sistema). Va tolto anche il valore VUOTO che il vecchio
;     disinstallatore lascia (APP_UNASSOCIATE riscrive il backup, "" se non c'era nulla, invece di
;     cancellare): un predefinito vuoto in HKCU nasconderebbe quello di sistema.
; Le scelte esplicite dell'utente (UserChoice, protetta da Windows) non si toccano.
;
; Dalla v0.8.10 gli script (.bat .cmd .ps1 .sh .bash) non sono più associati: si ripuliscono con la stessa
; regola, SOLO nelle chiavi che Orbit ha toccato (quelle col suo valore di backup), ma senza "Apri con".
;
; ProgID ed elenco delle estensioni si possono ridefinire PRIMA di includere questo file (la prova
; dell'installer usa un ProgID ed estensioni finti, per non toccare quelle vere del PC).

!ifndef ORBIT_PROGID
  !define ORBIT_PROGID "Orbit document"
!endif

; Le estensioni per cui Orbit compare in "Apri con" (le stesse di bundle.fileAssociations in tauri.conf.json,
; che vale ancora per macOS e Linux)
!ifmacrondef ORBIT_FOR_EACH_EXT
!macro ORBIT_FOR_EACH_EXT MACRO
  !insertmacro ${MACRO} "txt"
  !insertmacro ${MACRO} "md"
  !insertmacro ${MACRO} "markdown"
  !insertmacro ${MACRO} "log"
  !insertmacro ${MACRO} "json"
  !insertmacro ${MACRO} "jsonc"
  !insertmacro ${MACRO} "yaml"
  !insertmacro ${MACRO} "yml"
  !insertmacro ${MACRO} "toml"
  !insertmacro ${MACRO} "ini"
  !insertmacro ${MACRO} "conf"
  !insertmacro ${MACRO} "csv"
  !insertmacro ${MACRO} "xml"
  !insertmacro ${MACRO} "html"
  !insertmacro ${MACRO} "htm"
  !insertmacro ${MACRO} "css"
  !insertmacro ${MACRO} "scss"
  !insertmacro ${MACRO} "sass"
  !insertmacro ${MACRO} "less"
  !insertmacro ${MACRO} "js"
  !insertmacro ${MACRO} "mjs"
  !insertmacro ${MACRO} "cjs"
  !insertmacro ${MACRO} "jsx"
  !insertmacro ${MACRO} "ts"
  !insertmacro ${MACRO} "mts"
  !insertmacro ${MACRO} "cts"
  !insertmacro ${MACRO} "tsx"
  !insertmacro ${MACRO} "svelte"
  !insertmacro ${MACRO} "vue"
  !insertmacro ${MACRO} "py"
  !insertmacro ${MACRO} "rs"
  !insertmacro ${MACRO} "go"
  !insertmacro ${MACRO} "java"
  !insertmacro ${MACRO} "c"
  !insertmacro ${MACRO} "h"
  !insertmacro ${MACRO} "cpp"
  !insertmacro ${MACRO} "hpp"
  !insertmacro ${MACRO} "cs"
  !insertmacro ${MACRO} "rb"
  !insertmacro ${MACRO} "php"
  !insertmacro ${MACRO} "sql"
  !insertmacro ${MACRO} "png"
  !insertmacro ${MACRO} "jpg"
  !insertmacro ${MACRO} "jpeg"
  !insertmacro ${MACRO} "gif"
  !insertmacro ${MACRO} "webp"
  !insertmacro ${MACRO} "bmp"
  !insertmacro ${MACRO} "svg"
  !insertmacro ${MACRO} "pdf"
!macroend
!endif

; Restituisce il predefinito di EXT se è ancora quello messo da un Orbit precedente (o il valore vuoto del
; vecchio disinstallatore), e toglie il valore di backup. Non tocca un predefinito scelto da altri.
!macro ORBIT_UNDEFAULT EXT
  ClearErrors
  ReadRegStr $R7 SHCTX "Software\Classes\.${EXT}" "${ORBIT_PROGID}_backup"
  ${IfNot} ${Errors}
    ReadRegStr $R8 SHCTX "Software\Classes\.${EXT}" ""
    ${If} $R8 == "${ORBIT_PROGID}"
    ${OrIf} $R8 == ""
      ${If} $R7 == ""
      ${OrIf} $R7 == "${ORBIT_PROGID}"
        DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
      ${Else}
        WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "$R7"
      ${EndIf}
    ${EndIf}
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" "${ORBIT_PROGID}_backup"
  ${Else}
    ; nessun backup ma predefinito nostro (non dovrebbe succedere): si toglie comunque
    ReadRegStr $R8 SHCTX "Software\Classes\.${EXT}" ""
    ${If} $R8 == "${ORBIT_PROGID}"
      DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
    ${EndIf}
  ${EndIf}
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}"
!macroend

; Orbit in "Apri con" per EXT (e il predefinito restituito, se era nostro)
!macro ORBIT_OPENWITH_ADD EXT
  !insertmacro ORBIT_UNDEFAULT "${EXT}"
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${ORBIT_PROGID}" ""
!macroend

; Disinstallazione: via da "Apri con" (e le chiavi rimaste vuote)
!macro ORBIT_OPENWITH_REMOVE EXT
  !insertmacro ORBIT_UNDEFAULT "${EXT}"
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${ORBIT_PROGID}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Push $R7
  Push $R8
  ; il ProgID che "Apri con" lancia: Orbit col file come argomento (finestra leggera, M57)
  WriteRegStr SHCTX "Software\Classes\${ORBIT_PROGID}" "" "${PRODUCTNAME} document"
  WriteRegStr SHCTX "Software\Classes\${ORBIT_PROGID}\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\${ORBIT_PROGID}\shell" "" "open"
  WriteRegStr SHCTX "Software\Classes\${ORBIT_PROGID}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${ORBIT_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  !insertmacro ORBIT_FOR_EACH_EXT ORBIT_OPENWITH_ADD
  ; script di versioni vecchie: solo la pulizia, niente "Apri con" (la prova dell'installer la salta)
  !ifndef ORBIT_NO_LEGACY
    !insertmacro ORBIT_UNDEFAULT "bat"
    !insertmacro ORBIT_UNDEFAULT "cmd"
    !insertmacro ORBIT_UNDEFAULT "ps1"
    !insertmacro ORBIT_UNDEFAULT "sh"
    !insertmacro ORBIT_UNDEFAULT "bash"
  !endif
  Pop $R8
  Pop $R7
  ; avvisa la shell che le associazioni sono cambiate (SHCNE_ASSOCCHANGED)
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Push $R7
  Push $R8
  !insertmacro ORBIT_FOR_EACH_EXT ORBIT_OPENWITH_REMOVE
  DeleteRegKey SHCTX "Software\Classes\${ORBIT_PROGID}"
  Pop $R8
  Pop $R7
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
