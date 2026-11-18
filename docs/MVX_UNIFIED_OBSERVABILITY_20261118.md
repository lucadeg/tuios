# MVX TUIOS Unified Observability · 18 novembre 2026

**Stato: branch di implementazione, DRAFT / NO-GO.** Nessun merge, deploy o modifica a database, vault o chiavi DPAPI.

## Contratti implementati

Il catalogo di TUIOS è config/mvx-projects.json, con 12 progetti registrati. Il registro TUIOS usa lo schema mvx.tuios.diagnostic.v1 in ~/.hermes/.mvx-tuios-runtime/diagnostics/PROJECT_ID/events.jsonl. Lo storico FOS separato usa mvx.fos.diagnostic.v1 in ~/.hermes/diagnostics/founder-os/events.jsonl. I due schemi sono leggibili dalla CLI TUIOS per MVX Founder OS senza richiedere che Next.js sia avviato.

1. mvx-project-diagnostics.cjs: JSONL per progetto, timestamp UTC/runId/PID/dispositivo, livelli, whitelist dei metadati, rotazione di 4 MiB × 4 segmenti, protezione symlink e path traversal.
2. mvx-project-launcher.cjs: eventi per richiesta di avvio, processo effettivamente avviato, profilo non certificato, porte occupate, verifiche HTTP, autenticazione non verificata, observer e stato diagnostico. Tutti i profili inconfigurati restano bloccati.
3. mvx-project-observer.cjs: osservatore esterno ai processi avviati **dal launcher aggiornato**. Classifica errori riscontrati in log esistenti (MODULE_NOT_FOUND, PORT_IN_USE, OUT_OF_MEMORY, TIMEOUT, ACCESS_DENIED, DPAPI_ERROR, RUNTIME_ERROR), senza replicare testo grezzo, token, stack, environment, request, cookie o query. Sonda solo 127.0.0.1, HEAD con timeout, non prova l'autenticazione.
4. cmd/tuios/mvx_diagnostics.go: comandi nativi TUIOS per log e ultimo stato, filtraggio, follow, JSON sanitizzato e SSH batch con verifica della host key. Il catalogo è autoritativo, i path arbitrari non lo sono.
5. MVX Founder OS (PR #148): backend DPAPI/Next, frontend Vite dev, compilazione, HMR, browser error-class, TypeScript e build Vite con exit code preservato e nessun bypass IAM.

## Comandi nativi

    tuios mvx status mvx-ide-taurus
    tuios mvx logs mvx-light-monitor --tail 200 --level ERROR
    tuios mvx logs mvx-ide-taurus --follow --component project.runtime
    tuios mvx logs mvx-founder-os --json
    tuios mvx logs mvx-light-monitor --ssh Deglu@mini-pc1 --tail 100
    node mvx-project-launcher.cjs logs mvx-ide-taurus --tail 200
    node hermes-cli.js --mvx-logs mvx-light-monitor --follow

SSH richiede OpenSSH autorizzato e host key verificata. Il comando remoto native legge il log TUIOS del progetto. Per lo storico remoto DPAPI/FOS legacy usare il viewer FOS dedicato nella PR #4.

## Inventario e copertura

| Progetto | Inventario TUIOS | Osservatore di un nuovo avvio TUIOS | Plugin Vite nativo |
|---|---|---|---|
| MVX IDE TAURUS | Registrato; dev browser locale disponibile | Predisposto | Non ancora installato |
| MVX Light Monitor | Registrato; dev browser locale disponibile | Predisposto | Non ancora installato |
| MVX Founder OS | Registrato, profilo nuovo launcher bloccato | Logging FOS indipendente | Presente nel branch FOS, non deployato |
| MVX SaaS Master | Registrato, profili non certificati | Predisposto dopo certificazione | Non verificato |
| MVX Collection Master | Registrato, profili non certificati | Predisposto dopo certificazione | Non verificato |
| MVX Ads Master | Registrato, profili non certificati | Predisposto dopo certificazione | Non verificato |
| MVX Trading Master | Registrato, profili non certificati | Predisposto dopo certificazione | Non verificato |
| Gregory Job Scout | Registrato, profili non certificati | Predisposto dopo certificazione | Non verificato |
| MVX Engineering | Registrato, profili non certificati | Predisposto dopo certificazione | Non verificato |
| MVX Project Nomad | Registrato, repository offline | Nessun web server inventato | Non applicabile senza runtime Vite |
| LDG Innovation | Registrato, launcher legacy separato | Solo se lanciato dal nuovo launcher | Non verificato |
| Moser Commerce | Registrato, launcher legacy separato | Solo se lanciato dal nuovo launcher | Non verificato |

Un progetto censito senza log fornisce NO_EVIDENCE, non HEALTHY. Nessuna telemetria retroattiva di processi avviati da altri launcher. Runtime Rust, Go, Python, Docker e database richiedono adapter in-process approvati per stack trace, query planner e profiling; il bridge generico osserva soltanto avvio, log processo classificati e salute HTTP. Non promettere osservabilità completa senza tali adapter.

## Governance: Goal, requisiti, DoD, test e gate

- OBS-01: trasporto JSONL sicuro, separato per progetto, con rotazione e test negativi.
- OBS-02: integrazione nel launcher e osservatore autonomo, bounded IO, risorse limitate e nessuna operazione su processi non posseduti.
- OBS-03: TUIOS viewer, filtro, tail, follow, SSH, assenza di false attestazioni di autenticazione.
- OBS-04: DPAPI/Next e relativo recupero della PR #142 prima del rilascio #148.
- OBS-05: Vite FOS, eventi client/sviluppo/build con sanitizzazione e ricevute senza contenuti sensibili.
- OBS-06: plugin Vite nativi di TAURUS/Light Monitor da ammettere e collaudare separatamente.
- OBS-07: adapter runtime per gli altri progetti non certificati, solo dopo discovery e contratto autorizzato.
- OBS-08: Woodpecker Linux exact-SHA, TypeScript sul lockfile reale, test HTTP/E2E/browser, prova SSH e backup/rollback.

## Evidenze del laptop

- Test Node del launcher e telemetria TUIOS: 14 PASS, 0 FAIL, 1 SKIP su Windows (symlink non consentito). Il successivo aggiornamento di status richiede validazione exact-SHA finale.
- Go test mirato MVX: PASS (exit 0); Go build TUIOS: PASS (exit 0). Eseguibile QA restituisce NO_EVIDENCE per progetti senza registro.
- Vite plugin Vitest: 3 PASS. Builder TypeScript/Vite Node: 3 PASS, senza lanciare reali build Next o Vite.
- Verifica TypeScript completa della configurazione FOS NON attestata nell'archivio QA perché dipendenze locali provengono da versione Vite più vecchia; la toolchain effettiva del lockfile deve essere testata.
- NON effettuati: deployment mini-PC, test HTTP autenticati, prova SSH/Tailscale end-to-end, produzione, build E2E, Woodpecker exact-SHA o attestazione completa delle 12 applicazioni.

**Stato di rilascio: NO-GO.** La telemetria informa sulle prove osservate, non autorizza merge, login o modifica di database.
