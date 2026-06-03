; Custom NSIS uninstall hook for Capsuleers.Intel.
;
; A default electron-builder uninstall removes the installed program files but leaves
; the per-user data behind: the clipboard-watch state, share history, window state and
; Electron caches under %APPDATA%\capsuleers-intel-desktop. By product decision the
; uninstall must reclaim everything, unconditionally.
;
; Notes:
;  - perMachine is false (assisted, per-user install), so the uninstaller runs as the
;    user who installed -> $APPDATA / $LOCALAPPDATA resolve to that user's profile.
;  - nsis.deleteAppDataOnUninstall is one-click-only and this installer is assisted
;    (oneClick: false), so this customUnInstall macro is the supported path.
;  - electron-builder auto-includes build/installer.nsh (the default nsis.include),
;    so no config change is needed.
!macro customUnInstall
  ; userData: clipboard-watch state + share history + window state + Electron caches.
  RMDir /r "$APPDATA\capsuleers-intel-desktop"
  ; electron-updater download cache (updaterCacheDirName defaults to <name>-updater).
  RMDir /r "$LOCALAPPDATA\capsuleers-intel-desktop-updater"
!macroend
