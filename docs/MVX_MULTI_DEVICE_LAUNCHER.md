# MVX TUIOS · Multi-device Project Launcher

**Implementation:** `mvx-project-launcher.cjs` is invoked directly or through `hermes-cli.js` and the interactive `[MVX]` menu. Project definitions are in `config/mvx-projects.json`. The catalog currently includes 12 registered projects and lists other detected `.hermes/mvx-*` checkouts as unconfigured, rather than inventing runnable services.

## Commands

From TUIOS (PowerShell or CMD):

```powershell
node hermes-cli.js --mvx-projects
node hermes-cli.js --mvx-devices
node hermes-cli.js --mvx-launch mvx-ide-taurus --mode dev --transport local
node hermes-cli.js --mvx-status mvx-ide-taurus
node hermes-cli.js --mvx-launch mvx-light-monitor --mode dev --transport local
node hermes-cli.js --mvx-plan mvx-ide-taurus --mode dev --transport desktop-commander --device laptop
node hermes-cli.js --mvx-launch mvx-ide-taurus --mode dev --transport tailscale --device laptop
```

The equivalent direct CLI is `node mvx-project-launcher.cjs list|devices|status|launch|plan ...`.

## Auth profiles

| Project | Dev | Production |
| --- | --- | --- |
| MVX IDE TAURUS | `npm run dev`, loopback `127.0.0.1:1420`, browser only without native IAM | Only native `target/release/mvx-ide-taurus.exe`, with `MVX_KEYCLOAK_ISSUER` and `MVX_KEYCLOAK_CLIENT_ID` supplied by the environment. No web production bypass. A successful login still requires Keycloak runtime verification |
| MVX Light Monitor | `npm run dev`, loopback `127.0.0.1:1421` | Not certified. Refuses production until native IAM, signing and startup configuration have been validated |
| Other registered projects | Catalogued, legacy TUIOS commands remain available; new auth-free profile disabled | Disabled until each service has its verified SSO/RBAC and deployment profile |

**The dev browser exception does not grant native Tauri API access** and does not disable server-side authentication. Do not publish dev ports via LAN/Tailscale Serve/Ingress/reverse proxy. Production must never silently fall back to dev mode when identity configuration is missing.

## Device transport

The `local` transport starts from a verified local checkout under the user's `.hermes` directory and writes a PID, mode, log path and timestamp in `~/.hermes/.mvx-tuios-runtime/launches/`. The launcher checks that a loopback TCP port is free before starting, then performs HTTP readiness verification. An existing unknown listener is not commandeered.

The `tailscale` transport uses SSH over an explicitly configured tailnet IP (`100.64.0.0/10`) or MagicDNS `*.ts.net`, with `StrictHostKeyChecking=yes` and noninteractive batch authentication. Remote targets run their own installed TUIOS launcher. This requires an operational authenticated SSH server on the target, known host keys and tailnet ACLs; **it is not automatically enabled by installing Tailscale**.

The `desktop-commander` transport emits a structured dispatch plan (device ID + safe launcher command). A connected, authorized Desktop Commander MCP client such as ChatGPT can execute that plan using its remote `start_process` operation. **The standalone TUIOS Node process has no MCP credentials and does not pretend a plan is an executed remote launch.** The plan returns exit code 3 to distinguish it from a completed start.

Copy `config/mvx-devices.example.json` to the **private**, non-versioned file `~/.hermes/tuios/devices.json` on the computer initiating the command, and replace the placeholder device ID, SSH username and Tailscale address with verified details. Do not commit credentials, device IDs or SSH private keys.

## Verification

```powershell
node --check mvx-project-launcher.cjs
node --check hermes-cli.js
node --test clienttests/mvx-project-launcher.test.cjs
```

The tests cover catalog and mode admission, explicit Keycloak requirements, refusal of unsupported production profiles, Tailscale-only target validation, nonexecuting Desktop Commander plans, and refusal of traversal outside `.hermes`.

**Observed laptop QA, 17 November 2026:** TAURUS dev started via the new TUIOS launcher; its Vite server responded `HTTP 200 OK` on `127.0.0.1:1420`. A headless Microsoft Edge/Playwright run verified React rendered content, no native Keycloak login gate, no JavaScript page errors and exit code 0. This validates the *browser dev experience*, not every Tauri integration, the production IAM deployment, Tailscale connectivity or remote MCP automation.

## Restrictions and future integration

- Uncertified project profiles must remain `unconfigured`. Register each runtime only after binding to loopback in dev and verifying complete OIDC/Keycloak and RBAC in production.
- Multi-device dispatch must be authorized by SSH policy or by the user's connected Desktop Commander plugin. Do not disable Windows UAC, Keycloak or production access control to make a launch succeed.
- A process-start receipt is not an application health certificate; use the recorded PID and HTTP health endpoint for each project's actual readiness checks. Stop only verified owned processes.
- No claim of remote Woodpecker CI, native production auth sign-off, production deployment or full integration of all other MVX projects is implied.
