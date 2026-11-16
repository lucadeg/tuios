# MVX TUIOS headless service control (initial integration)

This is an optional, dependency-free Node.js backend-control adapter for the
existing TUIOS checkout, alongside the Go terminal window manager. It is **not**
a new terminal operating system, and does not replace the Go TUI or start all
web frontends.

## Commands

In the TUIOS project root:

\`\`\`powershell
.\mvx-control.ps1 help
.\mvx-control.ps1 list
.\mvx-control.ps1 doctor
.\mvx-control.ps1 commands founder-os
.\mvx-control.ps1 status founder-os
.\mvx-control.ps1 status all
.\mvx-control.ps1 invoke founder-os health
\`\`\`

CMD equivalent: \`mvx-control.bat list\`.

A configured service operation is invoked as:

\`\`\`powershell
.\mvx-control.ps1 invoke <service-id> <declared-operation> [payload-json-file]
\`\`\`

The JSON payload must be located under the authorized
\`%USERPROFILE%\.hermes\contents\` workspace. An undeclared operation is always
rejected, with no arbitrary URL or shell command mode. The first operator
manifest lives at \`%USERPROFILE%\.hermes\config\mvx-tuios-services.json\`;
a safe sample is provided in \`docs/mvx-tuios-services.example.json\`.

## Supported service IDs

- \`founder-os\`
- \`founder-os-monitor\`
- \`mvx-saas-master-ldg\`
- \`mvx-saas-master-customer\`
- \`mvx-trading-master-v2\`

**Registration is not readiness**. The module does not fabricate URLs or
pretend that installed directories imply a running backend. Operator-controlled
manifests explicitly declare local project paths, service origins, token
environment variable names, and allowed API methods.

The initial mini-pc1 operator manifest exposes only
\`founder-os.health\` to \`http://127.0.0.1:3001/api/health\`; other products
need verified backend APIs before their CRUD/management operations can be
enabled. \`doctor\` and \`status all\` distinguish missing configurations from
actual responding services. There is no automatic frontend startup.

## Security boundaries

- HTTPS is mandatory except on true loopback addresses.
- No arbitrary URL, untrusted project path, or dynamic command execution.
- Private backend launcher requires \`MVX_TUIOS_PROFILE=private\`, a declared
  existing entry script and a path that resolves inside \`.hermes\` (including
  symlink/junction realpath validation).
- Node uses the known \`process.execPath\`. Python requires an explicit,
  operator-approved absolute \`MVX_TUIOS_PYTHON_EXE\` path. No shell expansion.
- Every mutating API operation requires an actual configured service token
  regardless of whether its manifest accidentally declares it anonymous.
- Default behavior is read-only discovery. The adapter itself does not
  elevate via UAC or bypass PRE-UAC, GitHub human approvals, Sol review or
  device-role restrictions. Arbitrary \`stop\` by PID and destructive commands
  are intentionally unavailable until authenticated process ownership and
  bounded rollback are implemented.
- Authorization must also be enforced by every target backend. An allowlist
  in this CLI is not an authorization bypass or replacement for RBAC.

## Verification

On mini-pc1, \`node --test mvx_service_control.test.cjs\` passed **8/8** tests
after adding comprehensive cases for URL/path protections, undeclared actions,
required credentials on writes, all-service status results and pinned Python
runtime denial.

A startup/health response is not guaranteed merely because a target process
exists: a live Founder OS health probe previously reported the backend
unreachable. Service-specific health evidence is checked separately.

## Next integration steps

1. Map real, authenticated, tenant-scoped API operations for Founder OS Monitor
   and each MVX SaaS and Trading Master service, including truthful capability
   inventory and secure API documentation.
2. Introduce persistent process receipts and operator device-role policy.
   Start/stop/restart must enforce signed action approvals and exact executable
   identity, with UAC escalation performed only through the approved gate.
3. Add equivalent TUIOS/CLI commands for workflow tasks, deployments,
   metrics, provider configuration, project management and audit logs.
4. Integrate TUI commands into existing TUIOS menus and Go CLI without
   accidentally pulling private backend code into customer distributions.
5. Run Windows/Linux macOS compatibility CI, headless smoke and security
   threat-model reviews before calling this feature production-ready.

The current slice is an audited headless **foundation**, not full
command-parity with all product screens or a production-ready orchestration
service.
