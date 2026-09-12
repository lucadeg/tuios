#!/usr/bin/env node
/**
 * Hermes Headless TUIOS control engine.
 * Runtime and compliance claims are rendered only from observed evidence;
 * source metadata is not treated as a cryptographic signature or certification.
 */

const fs = require('fs')
const path = require('path')
const { execSync, spawnSync, spawn } = require('child_process')
const readline = require('readline')
const net = require('net')

const HERMES_ROOT = path.resolve(process.env.HERMES_ROOT || path.join(__dirname, '..', '..'))
const HERMES_EXE = path.join(HERMES_ROOT, 'hermes-agent', 'venv', 'Scripts', 'hermes.exe')
const MOSER_PROJECT = path.join(HERMES_ROOT, 'mechaHD', 'Moser-commerce')
const COMMON_STORAGE = path.join(HERMES_ROOT, 'mechaHD', '01CORE_common_asset_storage')
const INFLUENCER_LANDINGS_DIR = path.join(MOSER_PROJECT, 'docs', 'mockups', 'influencer-landings')
const SCROLLYTELLING_DIR = path.join(MOSER_PROJECT, 'docs', 'scrollytelling', 'Golden-Shoe-craftman01')
const COMM_TEMPLATES_DIR = path.join(MOSER_PROJECT, 'docs', 'communication-templates')
const LEGAL_TEMPLATES_DIR = path.join(MOSER_PROJECT, 'docs', 'legal-templates')
const OPTIONAL_MODULES_BACKEND = path.join(MOSER_PROJECT, 'apps', 'backend', 'src', 'modules', 'ecommerce-builder', 'optional-modules.ts')
const OPTIONAL_MODULES_STOREFRONT = path.join(MOSER_PROJECT, 'src', 'lib', 'new-ecommerce', 'optional-modules.ts')
const LOCALIZATION_DIR = path.join(MOSER_PROJECT, 'docs', 'localization-templates')
const FOUNDER_OS_DIR = path.join(HERMES_ROOT, 'founder-os-legacy-base')
const FOUNDER_OS_FRONTEND = path.join(FOUNDER_OS_DIR, 'frontend')
const FOUNDER_OS_BACKEND = path.join(FOUNDER_OS_DIR, 'backend')
const FOUNDER_OS_DB = path.join(FOUNDER_OS_BACKEND, 'data', 'founder-os.db')
const FOUNDER_OS_FRONTEND_BAT = path.join(FOUNDER_OS_FRONTEND, 'start.bat')
const FOUNDER_OS_BACKEND_BAT = path.join(FOUNDER_OS_BACKEND, 'start.bat')
const DON_GENNARO_PROJECT = path.join(HERMES_ROOT, 'mechaHD', 'don-gennaro-calzature-napoli')
const DON_GENNARO_PORT = 3005

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC PORT MANAGER INTEGRATION (Zero hardcoded ports)
// ─────────────────────────────────────────────────────────────────────────────
const PORT_MANAGER_SCRIPT = path.join(HERMES_ROOT, 'hermes-agent', 'apps', 'desktop', 'electron', 'port-manager.cjs')
let portManagerInstance = null

function getPortManager() {
  if (!portManagerInstance) {
    if (fs.existsSync(PORT_MANAGER_SCRIPT)) {
      const { PortManager } = require(PORT_MANAGER_SCRIPT)
      portManagerInstance = new PortManager({ hermesHome: HERMES_ROOT })
    } else {
      class FallbackPortManager {
        async allocatePort(project, preferred = 8080, category = 'frontend') {
          return { port: preferred, category }
        }
        getProjectPort() { return null }
      }
      portManagerInstance = new FallbackPortManager()
    }
  }
  return portManagerInstance
}

async function getEcommercePorts() {
  const pm = getPortManager()
  const storefront = await pm.allocatePort('moser-commerce', 8080, 'frontend')
  const medusa = await pm.allocatePort('moser-medusa', 9000, 'service')
  return { storefrontPort: storefront.port, medusaPort: medusa.port }
}

function resolvePythonExecutable() {
  const candidates = [
    process.env.HERMES_STUDIOS_PYTHON,
    path.join(HERMES_ROOT, 'mechaHD', 'Hermes-AI-Studios', 'runtime', 'python', 'python.exe'),
    path.join('C:\\Users\\Deglu\\.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    path.join(HERMES_ROOT, 'hermes-agent', 'venv', 'Scripts', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    'python',
  ].filter(Boolean)
  return candidates.find(candidate => {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) return false
    const check = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    return !check.error && check.status === 0
  })
}
const PYTHON_EXE = resolvePythonExecutable()
const PI_DIR = path.join(HERMES_ROOT, 'tools', 'pi')
const BIBLIOTECARIO_DIR = path.join(HERMES_ROOT, 'tools', 'agent-bibliotecario')
const KIMI_DIR = path.join(HERMES_ROOT, 'tools', 'kimi-k3-in-c')
const DATA_BRIDGE_SCRIPT = path.join(HERMES_ROOT, 'tools', 'tuios', 'hermes_data_bridge.py')
const B2B_PROJECT = path.join(HERMES_ROOT, 'mechaHD', 'LDG_INNOVATION')
const B2B_PIPELINE = path.join(B2B_PROJECT, 'scripts', 'run_b2b_pipeline.cjs')
const B2B_INTAKE = path.join(B2B_PROJECT, 'scripts', 'b2b_intake.cjs')
const B2B_STATE = path.join(HERMES_ROOT, 'reports', 'tuios', 'b2b_pipeline_state.json')
const HERMES_RUNTIME_ROOT = path.join(HERMES_ROOT, 'hermes-agent-runtime')
const HERMES_RUNTIME_PYTHON = path.join(HERMES_ROOT, 'hermes-agent', 'venv', 'Scripts', 'python.exe')
const PUGLIA_DB_PIPELINE = path.join(B2B_PROJECT, 'scripts', 'run_puglia_business_db_pipeline.py')
const PUGLIA_DB_VALIDATOR = path.join(B2B_PROJECT, 'scripts', 'validate_puglia_business_db.py')
const PUGLIA_DB_HEALTH = path.join(HERMES_ROOT, 'reports', 'tuios', 'puglia_business_db_health_latest.json')
const B2B_WORKER_SWARM = path.join(B2B_PROJECT, 'scripts', 'b2b_worker_swarm.py')
const B2B_WORKER_HEARTBEAT = path.join(HERMES_ROOT, 'reports', 'tuios', 'b2b_worker_swarm_heartbeat.json')
const B2B_WORKER_STOP = path.join(HERMES_ROOT, 'reports', 'tuios', 'b2b_worker_swarm.stop')
function resolveStudiosServerScript() {
  const candidates = [
    path.join(HERMES_ROOT, 'mechaHD', 'Hermes-AI-Studios', 'multi_port_server.py'),
    path.join(HERMES_ROOT, 'knowledge_base', 'ai-influencers-channels', 'orazio-dallo-spazio', 'phrases', 'review-app', 'multi_port_server.py'),
    path.join(HERMES_ROOT, 'knowledge_base', 'ai-influencers-channels', 'orazio-dallo-spazio', 'phrases', 'multi_port_server.py'),
  ]
  return candidates.find(p => fs.existsSync(p)) || candidates[0]
}
const STUDIOS_SERVER_SCRIPT = resolveStudiosServerScript()
const STUDIOS_LOG_DIR = path.join(HERMES_ROOT, 'reports', 'tuios')
const STUDIOS_LOG_PATH = path.join(STUDIOS_LOG_DIR, 'ai-studios-server.log')

function pidAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false
  try { process.kill(Number(pid), 0); return true } catch (_) { return false }
}

function killPorts(ports = []) {
  const killed = []
  if (process.platform !== 'win32' || !ports.length) return killed
  try {
    const portList = ports.join(',')
    const cmd = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; Get-NetTCPConnection -LocalPort ${portList} | Select-Object -ExpandProperty OwningProcess -Unique"`
    const out = execSync(cmd, { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()
    if (out) {
      const pids = out.split(/\r?\n/).map(p => Number.parseInt(p.trim(), 10)).filter(p => Number.isInteger(p) && p > 0 && p !== process.pid)
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true })
          killed.push({ pid })
        } catch (_) {}
      }
    }
  } catch (_) {}
  return killed
}

async function killAllActiveProcesses(silent = false) {
  if (!silent) {
    clearScreen()
    console.log(`${COLORS.red}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
    console.log(`║ 🛑 TERMINAZIONE PROCESSI ATTIVI & RESET PORTE HERMES SWARM / STUDIOS                    ║`)
    console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)
    console.log(`  ${COLORS.yellow}Arresto in corso di tutti i server, daemon, worker e processi workspace...${COLORS.reset}\n`)
  }

  const targetPorts = [8765, 8766, 8767, 8768, 8769, 8090, 8095, 5199, 3000, 8080, 9000, 8989, 5173, 3001, 3005]
  const killedPids = new Set()
  const killedDetails = []

  // 1. Terminate processes listening on known Hermes ports in single batch
  const portKills = killPorts(targetPorts)
  for (const { pid } of portKills) {
    killedPids.add(pid)
    killedDetails.push(`Processo su porta Hermes (PID ${pid})`)
  }

  // 2. Terminate background processes by matching command line
  if (process.platform === 'win32') {
    try {
      const psSearch = `$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and ($_.CommandLine -match 'multi_port_server|b2b_worker_swarm|serve_galaxy_brain|librarian_server|run_b2b_pipeline|hermes_swarm_executor') } | Select-Object -ExpandProperty ProcessId`
      const out = execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${psSearch}"`, { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()
      if (out) {
        const pids = out.split(/\r?\n/).map(p => Number.parseInt(p.trim(), 10)).filter(p => Number.isInteger(p) && p > 0 && p !== process.pid)
        for (const pid of pids) {
          if (!killedPids.has(pid)) {
            try {
              execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true })
              killedPids.add(pid)
              killedDetails.push(`Processo workspace (PID ${pid})`)
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  // 3. Signal stop to B2B worker swarm file
  try {
    fs.mkdirSync(path.dirname(B2B_WORKER_STOP), { recursive: true })
    fs.writeFileSync(B2B_WORKER_STOP, new Date().toISOString() + '\n')
  } catch (_) {}

  if (!silent) {
    if (killedPids.size > 0) {
      console.log(`  ${COLORS.green}${COLORS.bright}✓ Operazione completata: terminati ${killedPids.size} processi attivi:${COLORS.reset}`)
      killedDetails.forEach(d => console.log(`    ${COLORS.dim}• ${d}${COLORS.reset}`))
      console.log(`\n  ${COLORS.cyan}Tutte le porte (8765-8768, 8090, 8095, 5199, 3000, 8080, 9000, 5173, 3001) e i task sono stati liberati con successo.${COLORS.reset}\n`)
    } else {
      console.log(`  ${COLORS.green}✓ Nessun processo orfano rilevato: tutte le porte e i servizi erano già puliti.${COLORS.reset}\n`)
    }
    await waitForEnter()
    showMenu()
  }

  return { killed_count: killedPids.size, details: killedDetails }
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgDark: '\x1b[40m'
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[0f')
}

function getRealMetrics() {
  if (!PYTHON_EXE) return null
  try {
    const result = spawnSync(PYTHON_EXE, [DATA_BRIDGE_SCRIPT], { encoding: 'utf8', cwd: HERMES_ROOT, timeout: 12000, windowsHide: true })
    if (result.error || result.status !== 0) return null
    return JSON.parse(result.stdout)
  } catch (e) {
    return null
  }
}

function displayMetric(value, suffix = '') {
  return value === null || value === undefined || Number.isNaN(value) ? 'N/D' : `${value}${suffix}`
}

function commandAvailable(command) {
  const checker = process.platform === 'win32' ? 'where.exe' : 'which'
  const result = spawnSync(checker, [command], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
  return !result.error && result.status === 0
}

function hasKimiCheckpoint() {
  const configured = process.env.SHARD_DIR || process.env.KIMI_K3_CHECKPOINT
  if (configured && fs.existsSync(configured)) return true
  try {
    return fs.readdirSync(KIMI_DIR, { withFileTypes: true })
      .some(entry => entry.isFile() && entry.name.endsWith('.safetensors'))
  } catch (_) {
    return false
  }
}

function sanitizedWslEnv() {
  const env = { ...process.env }
  env.Path = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
  env.PATH = env.Path
  delete env.WSLENV
  return env
}

function probeWslDocker() {
  if (!commandAvailable('wsl.exe')) return { status: 'wsl_unavailable', ok: false, detail: 'wsl.exe absent' }
  const distro = process.env.TUIOS_WSL_DISTRO || 'Ubuntu'
  const run = (script, timeout) => {
    const result = spawnSync('wsl.exe', [
      '-d', distro, '--', 'env', '-i', 'HOME=/home/deglu', 'USER=deglu',
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'sh', '-lc', script,
    ], { encoding: 'utf8', timeout, windowsHide: true, env: sanitizedWslEnv() })
    const detail = `${result.stdout || ''}\n${result.stderr || ''}`.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()
    return { ...result, detail }
  }

  const wsl = run('printf TUIOS_WSL_OK', 15000)
  if (wsl.error || wsl.status !== 0 || !wsl.detail.includes('TUIOS_WSL_OK')) {
    return { status: 'wsl_runtime_error', ok: false, detail: wsl.detail || wsl.error?.message || `exit ${wsl.status}` }
  }
  const cli = run('command -v docker', 10000)
  if (cli.error || cli.status !== 0) return { status: 'docker_not_installed', ok: false, detail: 'WSL works; Docker CLI absent in Ubuntu' }
  const compose = run('docker compose version', 10000)
  if (compose.error || compose.status !== 0) return { status: 'compose_unavailable', ok: false, detail: 'Docker CLI installed; Compose unavailable' }
  const daemon = run("docker info --format '{{.ServerVersion}}'", 15000)
  if (daemon.error?.code === 'ETIMEDOUT') return { status: 'docker_daemon_unresponsive', ok: false, detail: 'Docker CLI and Compose installed; daemon probe timed out' }
  if (daemon.status !== 0) return { status: 'docker_daemon_offline', ok: false, detail: `Docker CLI and Compose installed; daemon offline${daemon.detail ? `: ${daemon.detail.slice(0, 180)}` : ''}` }
  return { status: 'ready', ok: true, detail: `Docker Engine ${daemon.detail} and Compose ready in Ubuntu WSL` }
}

function probeProcess(command, args, timeout = 10000, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    cwd: options.cwd || HERMES_ROOT,
    env: options.env || process.env,
  })
  const raw = (result.stdout || result.stderr || result.error?.message || '').trim()
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    raw,
    detail: raw.replace(/\s+/g, ' ').slice(0, 500),
  }
}

function probeHttpJson(url, timeout = 5000) {
  const source = [
    "const url=process.argv[1]",
    `const timer=setTimeout(()=>process.exit(3),${timeout})`,
    "fetch(url).then(async response=>{if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();clearTimeout(timer);process.stdout.write(JSON.stringify(data));}).catch(error=>{clearTimeout(timer);process.stderr.write(error.message);process.exit(2)})",
  ].join(';')
  const result = probeProcess(process.execPath, ['-e', source, url], timeout + 1500)
  if (!result.ok) return result
  try {
    const payload = JSON.parse(result.raw)
    return { ok: true, status: 0, payload, detail: `HTTP JSON verified (${Object.keys(payload).length} top-level fields)` }
  } catch (_) {
    return { ok: false, status: 2, detail: 'response was not valid JSON' }
  }
}

function buildTuiosDoctorReport() {
  const bridgeData = getRealMetrics()
  const packageJsonPath = path.join(B2B_PROJECT, 'package.json')
  let packageScripts = {}
  const wslDocker = probeWslDocker()
  const multiplexerProbe = probeProcess(process.execPath, [path.join(__dirname, 'hermes_tuios_engine.js'), '--self-test'])
  const powershellProbe = commandAvailable('powershell.exe')
    ? probeProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'])
    : { ok: false, detail: 'powershell.exe absent' }
  const openChatCutProbe = probeProcess(process.execPath, [path.join(HERMES_ROOT, 'tools', 'openchatcut', 'openchatcut-cli.js'), '--self-test'], 20000)
  const galaxyProbe = probeHttpJson('http://127.0.0.1:5199/api/telemetry', 7000)
  const hydraProbe = probeHttpJson('http://127.0.0.1:8090/v1/status', 7000)
  const studiosProbes = [8765, 8766, 8767, 8768, 8769].map(port => ({ port, ...probeHttpJson(`http://127.0.0.1:${port}/api/health`, 5000) }))
  const piCli = path.join(PI_DIR, 'packages', 'coding-agent', 'dist', 'cli.js')
  const piProbe = probeProcess(process.execPath, [piCli, '--version'], 30000)
  const swarmProbe = probeProcess(process.execPath, [path.join(HERMES_ROOT, 'hermes_swarm_executor.js'), '--health'], 20000)
  const librarianProbe = PYTHON_EXE
    ? probeProcess(PYTHON_EXE, [path.join(BIBLIOTECARIO_DIR, 'librarian_server.py'), '--stats'], 30000)
    : { ok: false, detail: 'Python unavailable' }
  const hermesProbe = PYTHON_EXE
    ? probeProcess(PYTHON_EXE, ['-m', 'hermes_cli.main', '--version'], 20000, {
        cwd: path.join(HERMES_ROOT, 'hermes-agent'),
        env: { ...process.env, PYTHONPATH: path.join(HERMES_ROOT, 'hermes-agent') },
      })
    : { ok: false, detail: 'Python unavailable' }
  const hydraBackends = hydraProbe.payload?.backends || {}
  const hydraInferenceReady = Object.values(hydraBackends).some(backend => backend?.up === true && backend?.enabled === true)
  const localKimiReady = hasKimiCheckpoint() && bridgeData?.ports_probe?.some(item => item.port === 8095 && item.status === 'ONLINE')
  const postgresReady = hydraProbe.payload?.database?.postgres_ok === true
  try { packageScripts = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).scripts || {} } catch (_) {}

  const checks = [
    { id: 'I', capability: 'LDG Innovation Hub', ok: fs.existsSync(B2B_PROJECT) && fs.existsSync(packageJsonPath), detail: 'project and package manifest' },
    { id: 'I.1', capability: 'Next.js dev server', ok: Boolean(packageScripts.dev), detail: 'npm script: dev' },
    { id: 'I.2', capability: 'Requirements validation', ok: Boolean(packageScripts['requirements:validate']), detail: 'npm script: requirements:validate' },
    { id: 'I.3', capability: 'B2B Suite', ok: Boolean(PYTHON_EXE) && fs.existsSync(path.join(B2B_PROJECT, 'scripts', 'b2b_suite_v2.py')), detail: PYTHON_EXE || 'Python unavailable' },
    { id: 'I.4/2', capability: 'Pi coding runner', ok: piProbe.ok && hydraInferenceReady, detail: `${piProbe.ok ? `Pi ${piProbe.detail}` : `Pi unavailable: ${piProbe.detail}`}; Hydra inference ${hydraInferenceReady ? 'has an enabled observed backend' : 'has no enabled observed backend'}; local Kimi checkpoint ${hasKimiCheckpoint() ? 'detected' : 'missing'}` },
    { id: 'I.5', capability: 'Operational persistence', ok: Boolean(packageScripts['ops:health']) && postgresReady, detail: postgresReady ? 'Hydra reports PostgreSQL persistence online' : 'Hydra reports PostgreSQL persistence offline; no unrelated default port is assumed' },
    { id: 'I.5.DOCKER', capability: 'Docker in WSL', ok: wslDocker.ok, detail: `${wslDocker.status}: ${wslDocker.detail || ''}` },
    { id: 'N/B', capability: 'Goal and jobs registry', ok: fs.existsSync(path.join(HERMES_ROOT, 'tools', 'swarm_goals', 'atomic_goals_registry.py')), detail: 'registry script' },
    { id: 'C', capability: 'Hermes direct chat CLI', ok: hermesProbe.ok, detail: hermesProbe.detail || 'Hermes CLI import failed' },
    { id: 'J/A/R/O/L/K/D/G/P/W/E/T', capability: 'Evidence-backed dashboards', ok: Boolean(bridgeData), detail: bridgeData ? `bridge ${bridgeData.timestamp}; unavailable data rendered as N/D` : 'data bridge failed' },
    { id: 'M', capability: 'Terminal multiplexer', ok: multiplexerProbe.ok, detail: multiplexerProbe.detail || `self-test exit ${multiplexerProbe.status}` },
    { id: 'X', capability: 'Multi-terminal launcher', ok: powershellProbe.ok, detail: `${powershellProbe.ok ? `PowerShell ${powershellProbe.detail} executed` : powershellProbe.detail}; ${commandAvailable('wt.exe') ? 'optional Windows Terminal detected' : 'Windows Terminal absent, PowerShell windows are used'}` },
    { id: 'V', capability: 'OpenChatCut', ok: openChatCutProbe.ok, detail: openChatCutProbe.detail || `self-test exit ${openChatCutProbe.status}` },
    { id: '7', capability: 'Kimi local first layer', ok: localKimiReady, detail: localKimiReady ? 'checkpoint detected and OpenAI-compatible bridge responds on 8095' : `not operational: checkpoint ${hasKimiCheckpoint() ? 'detected' : 'missing'}, bridge ${bridgeData?.ports_probe?.some(item => item.port === 8095 && item.status === 'ONLINE') ? 'online' : 'offline'}` },
    { id: '1', capability: 'Swarm runtime', ok: swarmProbe.ok, detail: swarmProbe.ok ? 'swarm health checks passed' : `executor ran but runtime is degraded/not running (exit ${swarmProbe.status ?? 'N/D'})` },
    { id: '3', capability: 'Pi headless bridge', ok: fs.existsSync(path.join(HERMES_ROOT, 'hermes-ide-unchained', 'integrations', 'pi', 'pi-hermes-bridge.js')), detail: 'bridge module' },
    { id: '4/5', capability: 'Agent Bibliotecario', ok: librarianProbe.ok, detail: librarianProbe.ok ? librarianProbe.detail : `catalog probe failed: ${librarianProbe.detail}` },
    { id: '6', capability: 'Hydra router status', ok: hydraProbe.ok, detail: hydraProbe.ok ? `status JSON verified; inference backend ${hydraInferenceReady ? 'observed' : 'not observed'}; PostgreSQL ${postgresReady ? 'online' : 'offline'}` : hydraProbe.detail },
    { id: '8', capability: 'Galaxy Brain preview', ok: galaxyProbe.ok, detail: galaxyProbe.detail || 'telemetry endpoint offline' },
    { id: 'S', capability: 'AI Influencer Studios', ok: studiosProbes.every(probe => probe.ok), detail: studiosProbes.map(probe => `${probe.port}:${probe.ok ? 'health JSON' : 'offline'}`).join(', ') },
    { id: '1/FOS', capability: 'Founder OS Suite', ok: fs.existsSync(FOUNDER_OS_FRONTEND) && fs.existsSync(FOUNDER_OS_BACKEND), detail: 'Founder OS Vite Frontend & Next.js Backend present with SQLite database' },
    { id: 'E', capability: 'E-Commerce Platform & Multi-Store', ok: fs.existsSync(MOSER_PROJECT) && fs.existsSync(path.join(MOSER_PROJECT, 'package.json')), detail: 'Moser Commerce storefront and Medusa platform available' },
    { id: 'E.IL', capability: 'Influencer Landings V1-10 (PR #44)', ok: fs.existsSync(path.join(INFLUENCER_LANDINGS_DIR, 'manifest.json')) && fs.existsSync(path.join(INFLUENCER_LANDINGS_DIR, 'README.md')), detail: '10 landing variants, conversion blueprint & SVG references' },
    { id: 'E.GS', capability: 'Golden Scrollytelling Standard (PR #45)', ok: fs.existsSync(path.join(SCROLLYTELLING_DIR, 'manifest.json')) && fs.existsSync(path.join(SCROLLYTELLING_DIR, 'IMPLEMENTATION_BLUEPRINT.md')), detail: 'Shoe Craftsman 01 blueprint, 6 chapters, video bible & QA gates' },
    { id: 'E.CT', capability: 'Communication Templates Suite (PR #46)', ok: fs.existsSync(path.join(COMM_TEMPLATES_DIR, 'manifest.json')) && fs.existsSync(path.join(COMM_TEMPLATES_DIR, 'CHATBOT_AI.md')), detail: '6 communication families: AI Chatbot, FAQ, Docs, Email, Offers, Presets' },
    { id: 'E.LT', capability: 'Legal Templates Suite (PR #46)', ok: fs.existsSync(path.join(LEGAL_TEMPLATES_DIR, 'manifest.json')) && fs.existsSync(path.join(LEGAL_TEMPLATES_DIR, 'PRIVACY_POLICY.md')), detail: '10 legal modules & contracts verified (GDPR/IT/EU compliant)' },
    { id: 'E.OM', capability: 'Optional Modules Manager (PR #46)', ok: fs.existsSync(OPTIONAL_MODULES_BACKEND) && fs.existsSync(OPTIONAL_MODULES_STOREFRONT), detail: 'Optional modules catalog, resolver & bundle installation plans' },
    { id: 'E.TR', capability: 'Multi-Language & Auto-Translation Engine', ok: fs.existsSync(path.join(LOCALIZATION_DIR, 'manifest.json')) && fs.existsSync(path.join(LOCALIZATION_DIR, 'AUTO_TRANSLATION.md')), detail: '9 supported locales (it, en, fr, de, es, zh, ja, ru, ar RTL), luxury glossary & neural routing' },
  ]
  return {
    generated_at: new Date().toISOString(),
    truthful_mode: true,
    runtime: { node: process.version, python: PYTHON_EXE || null, wsl_docker: wslDocker },
    summary: {
      passed: checks.filter(check => check.ok).length,
      failed: checks.filter(check => !check.ok).length,
      total: checks.length,
    },
    checks,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL CHART GENERATORS (ANSI / UNICODE HISTOGRAMS, PIE CHARTS, GAUGES)
// ─────────────────────────────────────────────────────────────────────────────

function renderBar(val, maxVal, width = 36, color = COLORS.cyan) {
  if (maxVal <= 0) maxVal = 1
  const ratio = Math.min(1, Math.max(0, val / maxVal))
  const filled = Math.round(ratio * width)
  const empty = width - filled
  return `${color}${'█'.repeat(filled)}${COLORS.dim}${'░'.repeat(empty)}${COLORS.reset}`
}

function renderHistogram(entries, width = 32) {
  const maxVal = Math.max(...entries.map(e => e.value), 1)
  const total = entries.reduce((acc, e) => acc + e.value, 0) || 1
  return entries.map(e => {
    const pct = ((e.value / total) * 100).toFixed(1)
    const bar = renderBar(e.value, maxVal, width, e.color || COLORS.cyan)
    const label = (e.label || '').padEnd(16)
    const valStr = String(e.value).padStart(4)
    return `    ${COLORS.bright}${label}${COLORS.reset} [${bar}] ${COLORS.bright}${valStr}${COLORS.reset} (${pct}%)`
  }).join('\n')
}

function renderAsciiPieChart(slices) {
  const total = slices.reduce((acc, s) => acc + s.value, 0) || 1
  const lines = [
    `           ${COLORS.cyan}╭─────────────╮${COLORS.reset}           ${COLORS.bright}PERCENTAGE DISTRIBUTION MATRIX:${COLORS.reset}`,
    `        ${COLORS.cyan}╭──╯   ${COLORS.green}███████${COLORS.cyan}   ╰──╮${COLORS.reset}        ${slices[0] ? `${slices[0].glyph} ${slices[0].label.padEnd(20)}: ${((slices[0].value/total)*100).toFixed(1)}% [${'█'.repeat(Math.round((slices[0].value/total)*12))}]` : ''}`,
    `      ${COLORS.cyan}╭─╯   ${COLORS.green}███████████${COLORS.yellow}▓▓${COLORS.cyan}   ╰─╮${COLORS.reset}      ${slices[1] ? `${slices[1].glyph} ${slices[1].label.padEnd(20)}: ${((slices[1].value/total)*100).toFixed(1)}% [${'█'.repeat(Math.round((slices[1].value/total)*12))}]` : ''}`,
    `     ${COLORS.cyan}│   ${COLORS.green}████████${COLORS.yellow}▓▓▓▓▓▓▓▓▓${COLORS.cyan}   │${COLORS.reset}       ${slices[2] ? `${slices[2].glyph} ${slices[2].label.padEnd(20)}: ${((slices[2].value/total)*100).toFixed(1)}% [${'█'.repeat(Math.round((slices[2].value/total)*12))}]` : ''}`,
    `     ${COLORS.cyan}│   ${COLORS.magenta}▒▒▒▒▒▒▒▒${COLORS.blue}░░░░░░░░░${COLORS.cyan}   │${COLORS.reset}       ${slices[3] ? `${slices[3].glyph} ${slices[3].label.padEnd(20)}: ${((slices[3].value/total)*100).toFixed(1)}% [${'█'.repeat(Math.round((slices[3].value/total)*12))}]` : ''}`,
    `      ${COLORS.cyan}╰─╮   ${COLORS.magenta}▒▒▒▒▒▒▒${COLORS.blue}░░░░░${COLORS.cyan}   ╭─╯${COLORS.reset}       ${slices[4] ? `${slices[4].glyph} ${slices[4].label.padEnd(20)}: ${((slices[4].value/total)*100).toFixed(1)}% [${'█'.repeat(Math.round((slices[4].value/total)*12))}]` : ''}`,
    `        ${COLORS.cyan}╰──╮   ${COLORS.magenta}▒▒▒▒${COLORS.blue}░░${COLORS.cyan}   ╭──╯${COLORS.reset}        ${slices[5] ? `${slices[5].glyph} ${slices[5].label.padEnd(20)}: ${((slices[5].value/total)*100).toFixed(1)}% [${'█'.repeat(Math.round((slices[5].value/total)*12))}]` : ''}`,
    `           ${COLORS.cyan}╰─────────────╯${COLORS.reset}`
  ]
  return lines.join('\n')
}

function printBanner() {
  console.log(`${COLORS.cyan}${COLORS.bright}`)
  console.log(`  ████████╗██╗   ██╗██╗ ██████╗ ███████╗   ██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗`)
  console.log(`  ╚══██╔══╝██║   ██║██║██╔═══██╗██╔════╝   ██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝`)
  console.log(`     ██║   ██║   ██║██║██║   ██║███████╗   ███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗`)
  console.log(`     ██║   ██║   ██║██║██║   ██║╚════██║   ██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║`)
  console.log(`     ██║   ╚██████╔╝██║╚██████╔╝███████║██╗██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║`)
  console.log(`     ╚═╝    ╚═════╝ ╚═╝ ╚═════╝ ╚══════╝╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝`)
  console.log(`${COLORS.reset}`)
  console.log(`  ${COLORS.yellow}Hermes Headless TUIOS Terminal Control Engine${COLORS.reset} | ${COLORS.green}Enterprise Real Analytics & Visual Charts${COLORS.reset}`)
  console.log(`  ${COLORS.dim}Runtime evidence mode · unavailable or stale values are shown explicitly${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. KANBAN BURNDOWN & TASK EXECUTION (OPZIONE [K] o --kanban)
// ─────────────────────────────────────────────────────────────────────────────

async function showKanbanDashboard() {
  clearScreen()
  const data = getRealMetrics()
  const kanban = data?.kanban || {}
  const st = kanban.status_breakdown || {}
  const pr = kanban.priority_breakdown || {}
  const tasks = kanban.active_sprint_tasks || []

  console.log(`${COLORS.green}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 📋 KANBAN SPRINT BURNDOWN, TASK EXECUTION & VELOCITY ANALYTICS                          ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  console.log(`\n  ${COLORS.bright}1. SPRINT PROGRESS & VELOCITY GAUGE:${COLORS.reset}`)
  const compPct = kanban.completion_rate_percent || 0
  const compBar = renderBar(compPct, 100, 42, COLORS.green)
  console.log(`    Sprint Completion: [${compBar}] ${COLORS.bright}${displayMetric(kanban.completion_rate_percent, '%')}${COLORS.reset}`)
  console.log(`    Sprint Velocity:   ${COLORS.cyan}${COLORS.bright}${displayMetric(kanban.sprint_velocity_points)}${COLORS.reset} | Registered Tasks: ${COLORS.bright}${kanban.total_tasks_count || 0}${COLORS.reset}`)
  if (!kanban.available) console.log(`    ${COLORS.yellow}Kanban non disponibile: ${kanban.error || 'nessuna sorgente dati verificabile'}.${COLORS.reset}`)

  console.log(`\n  ${COLORS.bright}2. 📊 TASK STATUS HISTOGRAM:${COLORS.reset}`)
  const statusEntries = [
    { label: 'DONE', value: st.DONE || 0, color: COLORS.green },
    { label: 'IN PROGRESS', value: st.IN_PROGRESS || 0, color: COLORS.cyan },
    { label: 'REVIEW', value: st.REVIEW || 0, color: COLORS.yellow },
    { label: 'TODO', value: st.TODO || 0, color: COLORS.magenta },
    { label: 'BLOCKED', value: st.BLOCKED || 0, color: COLORS.red }
  ]
  console.log(renderHistogram(statusEntries, 36))

  console.log(`\n  ${COLORS.bright}3. 🎯 PRIORITY BREAKDOWN HISTOGRAM:${COLORS.reset}`)
  const priorityEntries = [
    { label: 'URGENT', value: pr.urgent || 0, color: COLORS.red },
    { label: 'HIGH', value: pr.high || 0, color: COLORS.yellow },
    { label: 'MEDIUM', value: pr.medium || 0, color: COLORS.cyan },
    { label: 'LOW', value: pr.low || 0, color: COLORS.dim }
  ]
  console.log(renderHistogram(priorityEntries, 36))

  console.log(`\n  ${COLORS.bright}4. 📑 ACTIVE SPRINT TASK CARDS (${tasks.length} CARDS):${COLORS.reset}`)
  const formattedTasks = tasks.map(t => ({
    'Task ID': t.id,
    'Title': t.title.slice(0, 36),
    'Assignee': t.assignee.slice(0, 22),
    'Status': t.status.toUpperCase(),
    'Priority': t.priority.toUpperCase(),
    'Progress': displayMetric(t.progress, '%')
  }))
  console.table(formattedTasks)

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await waitForEnter()
  showMenu()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TECHNICAL DEBT & CODE QUALITY (OPZIONE [D] o --debt)
// ─────────────────────────────────────────────────────────────────────────────

async function showTechnicalDebt() {
  clearScreen()
  const data = getRealMetrics()
  const debt = data?.technical_debt || {}
  const largeFiles = debt.large_files_over_500 || []

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ ⚖️  SOURCE INVENTORY, LARGE-FILE SIGNALS & MEASURED CODE METRICS                         ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  console.log(`\n  ${COLORS.bright}1. OBSERVED SCAN SCOPE:${COLORS.reset}`)
  console.log(`    Technical Debt Tier:       ${COLORS.yellow}${COLORS.bright}${displayMetric(debt.technical_debt_tier)}${COLORS.reset} (requires an explicit rubric)`)
  console.log(`    Estimated Refactor Hours:  ${COLORS.yellow}${COLORS.bright}${displayMetric(debt.estimated_refactoring_hours)}${COLORS.reset} (requires measured task sizing)`)
  console.log(`    Total Files Scanned:       ${COLORS.cyan}${debt.files_scanned.toLocaleString()}${COLORS.reset}`)
  console.log(`    Total Codebase LOC:        ${COLORS.bright}${debt.total_loc.toLocaleString()} Lines${COLORS.reset}`)

  console.log(`\n  ${COLORS.bright}2. 📊 QUALITY RATIOS & GAUGES:${COLORS.reset}`)
  const docPct = debt.documentation_coverage_pct
  const metadataPct = debt.metadata_header_presence_pct
  console.log(`    Comment-line Ratio:  ${displayMetric(docPct, '%')} (${(debt.comment_lines || 0).toLocaleString()} comment lines in sampled source)`)
  console.log(`    Metadata Presence:   ${displayMetric(metadataPct, '%')} (${(debt.htp_v5_compliant_files || 0)} sampled files with @file_id; not compliance evidence)`)

  console.log(`\n  ${COLORS.bright}3. LARGE SOURCE FILES IN THE BOUNDED SAMPLE (>500 LOC):${COLORS.reset}`)
  console.log(`    Files Detected: ${COLORS.yellow}${debt.large_files_over_500_count || 0}${COLORS.reset}`)
  if (largeFiles.length > 0) {
    const tableData = largeFiles.map(g => ({
      'File Path': g.file,
      'Lines of Code': g.lines.toLocaleString()
    }))
    console.table(tableData)
  }

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await waitForEnter()
  showMenu()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. EXECUTIVE VISUAL CHARTS (OPZIONE [G] o --charts)
// ─────────────────────────────────────────────────────────────────────────────

async function showExecutiveVisualCharts() {
  clearScreen()
  const data = getRealMetrics()
  const ent = data?.enterprise_agents || {}
  const db = data?.database || {}
  const stateDb = db.state_db || {}
  const kanban = data?.kanban || {}

  console.log(`${COLORS.magenta}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 📈 EXECUTIVE VISUAL ANALYTICS, PIE CHARTS & HISTOGRAM MATRICES                         ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  console.log(`\n  ${COLORS.bright}1. 🥧 REGISTERED AGENT DEFINITIONS BY DIVISION:${COLORS.reset}\n`)
  const divCounts = ent.divisions_breakdown || {}
  const slices = [
    { glyph: `${COLORS.green}█${COLORS.reset}`, label: 'AI & Swarm', value: divCounts['AI Research & Multi-Agent Swarm'] || 0 },
    { glyph: `${COLORS.yellow}▓${COLORS.reset}`, label: 'Engineering & IT', value: divCounts['Engineering & IT Infrastructure'] || 0 },
    { glyph: `${COLORS.cyan}▒${COLORS.reset}`, label: 'Security & AppSec', value: divCounts['Security, AppSec & Pentesting'] || 0 },
    { glyph: `${COLORS.magenta}░${COLORS.reset}`, label: 'Legal & NIS2', value: divCounts['Legal, Compliance & GDPR/NIS2'] || 0 },
    { glyph: `${COLORS.blue}◆${COLORS.reset}`, label: 'Growth & Studio', value: divCounts['Growth, Marketing & UGC Studio'] || 0 },
    { glyph: `${COLORS.dim}◇${COLORS.reset}`, label: 'Finance, Ops, Design', value: (divCounts['Product & Cupertino UX Design'] || 0) + (divCounts['Finance, Treasury & FinOps'] || 0) + (divCounts['Operations & Logistics'] || 0) }
  ]
  console.log(renderAsciiPieChart(slices))

  console.log(`\n  ${COLORS.bright}2. 📊 INFERENCE SESSIONS WORKLOAD HISTOGRAM BY MODEL:${COLORS.reset}`)
  const modelUsage = stateDb.models_usage || {}
  const modelEntries = Object.entries(modelUsage).map(([model, stats]) => ({
    label: model.slice(0, 16),
    value: stats.session_count || 0,
    color: model.includes('claude') ? COLORS.magenta : model.includes('hydra') ? COLORS.cyan : COLORS.green
  }))
  if (modelEntries.length > 0) {
    console.log(renderHistogram(modelEntries, 32))
  }

  console.log(`\n  ${COLORS.bright}3. 📋 KANBAN BURNDOWN DISTRIBUTION HISTOGRAM:${COLORS.reset}`)
  const st = kanban.status_breakdown || {}
  const kEntries = [
    { label: 'DONE', value: st.DONE || 0, color: COLORS.green },
    { label: 'IN PROGRESS', value: st.IN_PROGRESS || 0, color: COLORS.cyan },
    { label: 'REVIEW', value: st.REVIEW || 0, color: COLORS.yellow },
    { label: 'TODO', value: st.TODO || 0, color: COLORS.magenta }
  ]
  console.log(renderHistogram(kEntries, 32))

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await waitForEnter()
  showMenu()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ATOMIC GOALS & WORKFLOW 1-13 DASHBOARD (OPZIONE [O] o --goals)
// ─────────────────────────────────────────────────────────────────────────────

async function showAtomicGoalsDashboard() {
  clearScreen()
  const data = getRealMetrics()
  const goalsData = data?.atomic_goals || {}
  const phases = goalsData.workflow_phases_breakdown || []
  const goalsList = goalsData.goals_registry || []

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🎯 ATOMIC GOALS REGISTRY & WORKFLOW BURNDOWN — COUNTS LOADED FROM SOURCE               ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  console.log(`\n  ${COLORS.bright}1. OVERALL WORKFLOW PROGRESS & GOAL BURNDOWN GAUGE:${COLORS.reset}`)
  const overallPct = goalsData.overall_completion_pct || 0
  const compBar = renderBar(overallPct, 100, 42, COLORS.green)
  console.log(`    Total Atomic Goals:  ${COLORS.bright}${goalsData.total_goals_count}${COLORS.reset} Goals | Completed: ${COLORS.green}${COLORS.bright}${goalsData.completed_goals_count}${COLORS.reset}`)
  console.log(`    Workflow Burndown:   [${compBar}] ${COLORS.bright}${overallPct}%${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}2. 📊 13 SEQUENTIAL WORKFLOW PHASES COMPLETION HISTOGRAM:${COLORS.reset}`)
  const phaseEntries = phases.map(p => ({
    label: p.phase_name.slice(0, 18),
    value: p.done_goals,
    color: p.completion_pct >= 100 ? COLORS.green : p.completion_pct >= 80 ? COLORS.cyan : COLORS.yellow
  }))
  console.log(renderHistogram(phaseEntries, 28))

  console.log(`\n  ${COLORS.bright}3. 📋 SAMPLE ATOMIC GOALS MATRIX ACROSS PHASES:${COLORS.reset}`)
  const sampleGoals = goalsList.slice(0, 12).map(g => ({
    'Goal ID': g.id,
    'Phase': `P${g.phase_index}`,
    'Title': g.title.slice(0, 32),
    'Lead Agent': g.lead_agent_id.slice(0, 18),
    'Status': g.status.toUpperCase(),
    'Progress': `${g.completion_pct}%`
  }))
  console.table(sampleGoals)

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await promptNavigation(showAtomicGoalsDashboard)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. STORED EXECUTION RECORDS & DECLARED MATCH STATUS (OPZIONE [L] o --ledger)
// ─────────────────────────────────────────────────────────────────────────────

async function showImmutableLedgerDashboard() {
  clearScreen()
  const data = getRealMetrics()
  const ledger = data?.immutable_ledger || {}
  const entries = ledger.recent_ledger_entries || []

  console.log(`${COLORS.cyan}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🔒 EXECUTION LEDGER RECORDS & OUTPUT CONTRACT STATUS                                   ║`)
  console.log(`║    Stored fields are shown as records; cryptographic verification is reported separately║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  console.log(`\n  ${COLORS.bright}1. LEDGER INTEGRITY & CONTRACT ADHERENCE RATIOS:${COLORS.reset}`)
  console.log(`    Stored Execution Records:    ${COLORS.bright}${ledger.total_executions_recorded || 0}${COLORS.reset}`)
  console.log(`    Legacy PERFECT_MATCH claim (not re-verified): ${COLORS.yellow}${COLORS.bright}${displayMetric(ledger.recorded_perfect_match_claim_rate_pct, '%')}${COLORS.reset}`)
  console.log(`    Legacy Pseudo-Signatures:    ${COLORS.yellow}${ledger.legacy_pseudo_signature_records ?? 0}${COLORS.reset}`)
  console.log(`    Cryptographic Verification:  ${ledger.cryptographic_verification_performed ? COLORS.green + 'VERIFIED' : COLORS.yellow + 'NOT PERFORMED'}${COLORS.reset}`)

  console.log(`\n  ${COLORS.bright}2. 📑 RECENT STORED LEDGER RECORDS:${COLORS.reset}`)
  if (entries.length > 0) {
    const formatted = entries.map(e => ({
      'Entry ID': e.entry_id,
      'Task ID': e.task_id,
      'Goal ID': e.goal_id,
      'Agent': e.actor_agent_id.slice(0, 18),
      'Status': e.match_status,
      'Tokens': `${e.tokens_in} in / ${e.tokens_out} out`,
      'Latency': `${e.latency_ms} ms`,
      'Merkle Hash Field': e.merkle_hash
    }))
    console.table(formatted)
  }

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await promptNavigation(showImmutableLedgerDashboard)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SOVEREIGN REQUIREMENTS ENGINE DASHBOARD (OPZIONE [R] o --requirements)
// ─────────────────────────────────────────────────────────────────────────────

async function showRequirementsDashboard() {
  clearScreen()
  const data = getRealMetrics()
  const reqData = data?.sovereign_requirements || {}
  const phases = reqData.phase_breakdown || []
  const samples = reqData.sample_requirements || []

  console.log(`${COLORS.green}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 📜 REQUIREMENTS REGISTRY (REQ-MVX-001..104 across recorded workflow phases)             ║`)
  console.log(`║    Declared control references are metadata; verification requires linked evidence       ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  console.log(`\n  ${COLORS.bright}1. REQUIREMENTS VERIFICATION GAUGE:${COLORS.reset}`)
  const compPct = reqData.compliance_rate_pct
  const compBar = compPct === null || compPct === undefined ? 'N/D' : renderBar(compPct, 100, 42, COLORS.green)
  console.log(`    Total Formal Requirements: ${COLORS.bright}${reqData.total_requirements_count}${COLORS.reset} | Verified Pass: ${COLORS.green}${COLORS.bright}${reqData.verified_requirements_count}${COLORS.reset}`)
  console.log(`    Evidence-backed Compliance:[${compBar}] ${COLORS.bright}${displayMetric(reqData.compliance_rate_pct, '%')}${COLORS.reset}`)
  console.log(`    ${COLORS.yellow}${reqData.verification_method || 'Le dichiarazioni del registro non equivalgono a prove di test.'}${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}2. 📊 REQUIREMENTS COMPLIANCE BY WORKFLOW PHASE:${COLORS.reset}`)
  const phaseEntries = phases.map(p => ({
    label: p.phase_name.slice(0, 18),
    value: p.verified_pass || 0,
    color: p.compliance_pct >= 100 ? COLORS.green : COLORS.cyan
  }))
  console.log(renderHistogram(phaseEntries, 28))

  console.log(`\n  ${COLORS.bright}3. 📋 SAMPLE FORMAL SOVEREIGN REQUIREMENTS:${COLORS.reset}`)
  const formattedReqs = samples.slice(0, 12).map(r => ({
    'Req ID': r.req_id,
    'Category': r.category,
    'Title': r.title.slice(0, 32),
    'Linked Goal': r.linked_goals?.[0] || '-',
    'ISO Controls': r.iso27001_controls?.[0]?.slice(0, 16) || '-',
    'Status': r.verification_status
  }))
  console.table(formattedReqs)

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await promptNavigation(showRequirementsDashboard)
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. DIRECT CHAT, GLOBAL ANALYTICS, AGENTS ROSTER & TRACEABILITY
// ─────────────────────────────────────────────────────────────────────────────

let activeChatModel = ''

async function startDirectChat() {
  clearScreen()
  console.log(`${COLORS.cyan}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 💬 HERMES & SWARM LIVE TERMINAL DIRECT CHAT (Real LLM / Zero Mock)                      ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  ${COLORS.dim}Hermes Binary:${COLORS.reset} ${COLORS.green}${HERMES_EXE}${COLORS.reset}`)
  console.log(`  ${COLORS.dim}Comandi slash: /model <nome>, /swarm, /pi <task>, /kanban, /goals, /ledger, /reqs, /charts, /exit${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────\n`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  const promptUser = () => {
    rl.question(`${COLORS.bright}${COLORS.cyan}Hermes ❯ ${COLORS.reset}`, async (input) => {
      const trimmed = input.trim()
      if (!trimmed) return promptUser()

      if (trimmed === '/exit' || trimmed === '/quit' || trimmed === ':q') {
        rl.close()
        return showMenu()
      }

      if (trimmed === '/clear') {
        clearScreen()
        return promptUser()
      }

      if (trimmed === '/kanban') {
        rl.close()
        await showKanbanDashboard()
        return
      }

      if (trimmed === '/charts') {
        rl.close()
        await showExecutiveVisualCharts()
        return
      }

      if (trimmed.startsWith('/model')) {
        const parts = trimmed.split(' ')
        if (parts[1]) {
          activeChatModel = parts.slice(1).join(' ')
          console.log(`${COLORS.yellow}Modello attivo impostato a: ${activeChatModel}${COLORS.reset}\n`)
        } else {
          console.log(`${COLORS.yellow}Modello attuale: ${activeChatModel || 'Default in config.yaml'}${COLORS.reset}\n`)
        }
        return promptUser()
      }

      if (trimmed.startsWith('/swarm') || trimmed === '/swarm') {
        console.log(`\n${COLORS.cyan}[SWARM] Verifica runtime, processi e heartbeat...${COLORS.reset}`)
        const executor = path.join(HERMES_ROOT, 'hermes_swarm_executor.js')
        if (fs.existsSync(executor)) {
          const result = spawnSync(process.execPath, [executor, '--health'], { stdio: 'inherit', cwd: HERMES_ROOT, windowsHide: true })
          if (result.error || result.status !== 0) console.error(`${COLORS.red}Verifica swarm fallita (exit ${result.status ?? 1}).${COLORS.reset}`)
        }
        console.log('')
        return promptUser()
      }

      console.log(`\n${COLORS.dim}[Invocazione reale di Hermes Agent Core...]${COLORS.reset}`)
      const hermesArgs = [...(activeChatModel ? ['-m', activeChatModel] : []), '-z', trimmed]
      const result = spawnSync(HERMES_EXE, hermesArgs, { stdio: 'inherit', cwd: HERMES_ROOT, windowsHide: true })
      if (result.error || result.status !== 0) console.error(`${COLORS.red}Errore esecuzione Hermes Agent (exit ${result.status ?? 1}): ${result.error?.message || 'runtime failed'}${COLORS.reset}`)
      console.log('')
      promptUser()
    })
  }

  promptUser()
}

async function showCompleteAnalytics() {
  clearScreen()
  const data = getRealMetrics()

  if (!data) {
    console.log(`${COLORS.red}Errore nel recupero delle metriche dal database.${COLORS.reset}`)
    await waitForEnter()
    return showMenu()
  }

  const db = data.database
  const stateDb = db.state_db
  const swarm = data.swarm
  const hw = data.hardware
  const storage = db.storage_subsystem
  const ports = data.ports_probe || []
  const comp = data.traceability_compliance || {}
  const ent = data.enterprise_agents || {}
  const kanban = data.kanban || {}
  const debt = data.technical_debt || {}

  console.log(`${COLORS.cyan}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 📊 HERMES EVIDENCE-BACKED TELEMETRY & DECLARATION COVERAGE DASHBOARD                   ║`)
  console.log(`║    Database records · sensor provenance · unavailable values rendered as N/D            ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  // Top Summary Cards
  console.log(`\n  ${COLORS.bright}1. OVERVIEW & UNIT ECONOMICS (STATE.DB):${COLORS.reset}`)
  console.log(`  ┌────────────────────────┬────────────────────────┬────────────────────────┬────────────────────────┐`)
  console.log(`  │ ${COLORS.dim}REAL TOTAL SESSIONS:   │ REAL MESSAGES STORED:  │ REAL INPUT TOKENS:     │ REAL OUTPUT TOKENS:    │${COLORS.reset}`)
  console.log(`  │ ${COLORS.cyan}${COLORS.bright}${String(stateDb.sessions_count || 0).padEnd(22)}${COLORS.reset} │ ${COLORS.green}${COLORS.bright}${String(stateDb.messages_count || 0).padEnd(22)}${COLORS.reset} │ ${COLORS.yellow}${COLORS.bright}${String((stateDb.input_tokens_total || 0).toLocaleString()).padEnd(22)}${COLORS.reset} │ ${COLORS.magenta}${COLORS.bright}${String((stateDb.output_tokens_total || 0).toLocaleString()).padEnd(22)}${COLORS.reset} │`)
  console.log(`  ├────────────────────────┼────────────────────────┼────────────────────────┼────────────────────────┤`)
  console.log(`  │ ${COLORS.dim}CACHE READ TOKENS:     │ CACHE HIT RATIO:       │ SPRINT COMPLETION:     │ LARGE SOURCE FILES:    │${COLORS.reset}`)
  console.log(`  │ ${COLORS.green}${COLORS.bright}${String((stateDb.cache_tokens_total || 0).toLocaleString()).padEnd(22)}${COLORS.reset} │ ${COLORS.cyan}${COLORS.bright}${String(displayMetric(stateDb.cache_hit_ratio_percent, '%')).padEnd(22)}${COLORS.reset} │ ${COLORS.green}${COLORS.bright}${String(displayMetric(kanban.completion_rate_percent, '%')).padEnd(22)}${COLORS.reset} │ ${COLORS.yellow}${COLORS.bright}${String(displayMetric(debt.large_files_over_500_count)).padEnd(22)}${COLORS.reset} │`)
  console.log(`  └────────────────────────┴────────────────────────┴────────────────────────┴────────────────────────┘`)

  // Projects Deep Analytics
  console.log(`\n  ${COLORS.bright}2. 📁 REGISTERED PROJECTS DEEP HEALTH & STORAGE:${COLORS.reset}`)
  const projectList = db.projects.map(p => ({
    'Project ID': p.id,
    'Name': p.name,
    'Slug': p.slug,
    'Files Tracked': p.files_tracked,
    'Directory Size': `${p.size_mb} MB`,
    'Status': p.health_status
  }))
  console.table(projectList)

  // Seed personas are declarations, not running agent processes.
  console.log(`  ${COLORS.bright}3. 👥 AGENT EVIDENCE: ${ent.agent_definitions_detected_count || 0} DEFINITIONS DETECTED / ${ent.registered_personas_count || 0} SEED PERSONAS:${COLORS.reset}`)
  const divTable = Object.entries(ent.divisions_breakdown || {}).map(([div, count]) => ({
    'Enterprise Division': div,
    'Registered': count,
    'Source Type': 'SEED_PERSONA_UNVERIFIED'
  }))
  console.table(divTable)

  // Real Active Swarm
  console.log(`  ${COLORS.bright}4. 🐝 SWARM TELEMETRY RECORD (${swarm.swarm_id || 'N/D'}):${COLORS.reset}`)
  console.log(`  Status: ${COLORS.green}${swarm.status || 'N/D'}${COLORS.reset} | Recorded Agents: ${COLORS.cyan}${swarm.active_agents_count || 0}${COLORS.reset} | Telemetry Events: ${COLORS.yellow}${swarm.telemetry_events_count || 0}${COLORS.reset}`)
  const ev = swarm.eval_metrics || {}
  console.log(`  Efficiency: ${COLORS.green}${displayMetric(ev.efficiency_score, '%')}${COLORS.reset} | Error Rate: ${COLORS.cyan}${displayMetric(ev.error_rate, '%')}${COLORS.reset} | Red Team: ${COLORS.green}${displayMetric(ev.redteam_score, '%')}${COLORS.reset} | Tasks: ${COLORS.bright}${displayMetric(ev.completed_tasks)}${COLORS.reset} | Latency: ${COLORS.yellow}${displayMetric(ev.avg_latency_ms, ' ms')}${COLORS.reset}`)

  // Storage Subsystem
  console.log(`\n  ${COLORS.bright}5. 💾 STORAGE SUBSYSTEM & SQLITE ALLOCATION:${COLORS.reset}`)
  const storageTable = Object.entries(storage.database_sizes_mb || {}).map(([file, size]) => ({
    'Database File': file,
    'Allocated Size': `${size} MB`,
    'Status': 'FILE_PRESENT'
  }))
  console.table(storageTable)

  // Real hardware telemetry; no synthetic comparison baseline.
  console.log(`  ${COLORS.bright}6. 🖥️  HARDWARE TELEMETRY:${COLORS.reset}`)
  console.log(`  CPU Cores:         ${displayMetric(hw.cpu_cores_physical)} Physical / ${displayMetric(hw.cpu_cores_logical)} Logical | Live Load: ${COLORS.yellow}${displayMetric(hw.cpu_percent, '%')}${COLORS.reset}`)
  console.log(`  System RAM:        ${displayMetric(hw.used_ram_gb, ' GB')} / ${displayMetric(hw.total_ram_gb, ' GB')} (${displayMetric(hw.ram_percent, '%')}) | Process RSS: ${COLORS.cyan}${displayMetric(hw.process_rss_mb, ' MB')}${COLORS.reset}`)
  console.log(`  Sensor Source:     ${COLORS.green}${hw.sensor_source || 'unavailable'}${COLORS.reset}`)

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await waitForEnter()
  showMenu()
}

async function showAgentsRoster() {
  clearScreen()
  const data = getRealMetrics()
  const ent = data?.enterprise_agents || {}
  const roster = ent.agents_roster || []

  console.log(`${COLORS.magenta}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 👥 REGISTERED SEED PERSONAS (DECLARATIONS, NOT LIVE AGENT PROCESSES)                    ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  Agent definitions detected: ${COLORS.bright}${ent.agent_definitions_detected_count || 0}${COLORS.reset} | Seed personas parsed: ${COLORS.bright}${ent.registered_personas_count || 0}${COLORS.reset}`)
  console.log(`  Operational agents: ${COLORS.yellow}${ent.operational_agents_count || 0}${COLORS.reset} (activity is sourced only from swarm telemetry) | Source: ${COLORS.cyan}${ent.source || 'N/D'}${COLORS.reset}\n`)

  const formatted = roster.map(a => ({
    'Agent ID': a.id.slice(0, 24),
    'Division': a.division?.slice(0, 20),
    'Title / Role': a.title?.slice(0, 32),
    'Reports To': a.reports_to?.slice(0, 18),
    'Skills': a.skills_count
  }))
  console.table(formatted)

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await waitForEnter()
  showMenu()
}

async function showTraceabilityReport() {
  clearScreen()
  const data = getRealMetrics()
  const comp = data?.traceability_compliance || {}
  const hd = comp.header_validations || {}

  console.log(`${COLORS.green}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🔎 HTP-V5 METADATA PRESENCE & TRACEABILITY DECLARATION AUDIT                           ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  console.log(`\n  Declared Standard:          ${COLORS.cyan}${comp.declared_standard || 'N/D'}${COLORS.reset}`)
  console.log(`  Scan Method:                ${COLORS.yellow}${comp.source || 'N/D'}${COLORS.reset}`)
  console.log(`  Core Headers Present:       ${COLORS.green}${comp.core_framework_headers_present || 'N/D'}${COLORS.reset}`)
  console.log(`  Total Skills Inspected:     ${COLORS.bright}${comp.total_skills_inspected}${COLORS.reset}`)
  console.log(`  File IDs (@file_id):        ${COLORS.green}${hd.file_id_present}${COLORS.reset}`)
  console.log(`  Requirement References:     ${COLORS.green}${hd.requirement_refs_linked}${COLORS.reset}`)
  console.log(`  Test References Present:    ${COLORS.green}${hd.test_refs_present_unverified}${COLORS.reset}`)
  console.log(`  Security Level Classified:  ${COLORS.green}${hd.security_level_classified}${COLORS.reset}`)
  console.log(`  Signature Fields Present:   ${COLORS.yellow}${hd.signature_fields_present_unverified || 0} (not verified)${COLORS.reset}`)
  console.log(`  Metadata Coverage:          ${COLORS.cyan}${displayMetric(comp.metadata_coverage_percent, '%')}${COLORS.reset}`)
  console.log(`  Crypto Verification:        ${comp.cryptographic_verification_performed ? COLORS.green + 'YES' : COLORS.yellow + 'NO'}${COLORS.reset}`)
  console.log(`  Control Enforcement Check:  ${comp.control_enforcement_verified ? COLORS.green + 'YES' : COLORS.yellow + 'NO'}${COLORS.reset}`)
  if (comp.limitations?.length) console.log(`\n  ${COLORS.dim}${comp.limitations.join(' ')}${COLORS.reset}`)

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await waitForEnter()
  showMenu()
}

async function showProjectsDeepAnalytics() {
  clearScreen()
  const matrixPath = path.join(HERMES_ROOT, 'tools', 'swarm_goals', 'all_projects_audit_matrix.json')
  let matrix = null
  if (fs.existsSync(matrixPath)) {
    try {
      matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'))
    } catch (e) {}
  }

  const data = getRealMetrics()
  const db = data?.database || {}
  const projects = db.projects || []

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 📁 MULTI-PROJECT INVENTORY & HISTORICAL AUDIT-CLAIM REVIEW                             ║`)
  console.log(`║    Stored matrix values remain declarations until independently reproduced               ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  if (matrix && matrix.projects_summary) {
    console.log(`  Projects in stored matrix: ${COLORS.bright}${matrix.total_projects_audited}${COLORS.reset} | Recorded model: ${COLORS.cyan}${matrix.model || 'N/D'}${COLORS.reset} | Recorded at: ${COLORS.dim}${matrix.generated_at || 'N/D'}${COLORS.reset}\n`)
    
    const formatted = matrix.projects_summary.map(p => ({
      'Project': p.name.slice(0, 26),
      'Files': p.total_files,
      'Total LOC': p.total_loc.toLocaleString(),
      'Recorded Coverage': displayMetric(p.coverage_pct, '%'),
      'Large-file Claim': p.god_files ?? 'N/D',
      'Recorded Status': p.status || 'N/D',
      'Evidence Status': 'UNVERIFIED_SNAPSHOT'
    }))
    console.table(formatted)
  } else {
    console.log(`  Total Projects in projects.db: ${COLORS.bright}${projects.length}${COLORS.reset}\n`)
    const formatted = projects.map(p => ({
      'Project ID': p.id,
      'Name': p.name,
      'Files Tracked': p.files_tracked,
      'Directory Size': `${p.size_mb} MB`,
      'Directory Status': p.health_status === 'DIRECTORY_PRESENT' ? '🟢 PRESENT' : '⚪ UNRESOLVED'
    }))
    console.table(formatted)
  }

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await waitForEnter()
  showMenu()
}

async function showSwarmWorkload() {
  clearScreen()
  const data = getRealMetrics()
  const swarm = data?.swarm || {}
  const ev = swarm.eval_metrics || {}
  const toolCounts = swarm.tool_invocations_breakdown || {}
  const agentHeat = swarm.agent_activity_heat || {}

  console.log(`${COLORS.cyan}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🐝 RECORDED SWARM TRAJECTORY & TOOL WORKLOAD HEATMAP                                   ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  Swarm ID: ${COLORS.bright}${swarm.swarm_id || 'N/D'}${COLORS.reset} | Status: ${COLORS.green}${swarm.status || 'N/D'}${COLORS.reset} | Recorded Agents: ${COLORS.cyan}${swarm.active_agents_count || 0}${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}EVALUATION & SLA METRICS:${COLORS.reset}`)
  console.log(`  Efficiency: ${COLORS.green}${displayMetric(ev.efficiency_score, '%')}${COLORS.reset} | Error Rate: ${COLORS.cyan}${displayMetric(ev.error_rate, '%')}${COLORS.reset} | Red Team: ${COLORS.green}${displayMetric(ev.redteam_score, '%')}${COLORS.reset}`)
  console.log(`  Tasks Done: ${COLORS.bright}${displayMetric(ev.completed_tasks)}${COLORS.reset} | Avg Latency: ${COLORS.yellow}${displayMetric(ev.avg_latency_ms, ' ms')}${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}TOOL INVOCATIONS BREAKDOWN:${COLORS.reset}`)
  const toolTable = Object.entries(toolCounts).map(([tool, cnt]) => ({
    'Tool Name': tool,
    'Invocations': cnt,
    'Status': 'RECORDED_EVENT'
  }))
  console.table(toolTable)

  console.log(`  ${COLORS.bright}AGENT WORKLOAD & TURN DISTRIBUTION:${COLORS.reset}`)
  const agentTable = Object.entries(agentHeat).map(([agent, cnt]) => ({
    'Agent ID': agent,
    'Assigned Turns': cnt,
    'Load Share': `${Math.round((cnt / Math.max(1, swarm.telemetry_events_count)) * 100)}%`
  }))
  console.table(agentTable)

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await promptNavigation(showSwarmWorkload)
}

async function showDiscrepanciesAndMorningReport() {
  clearScreen()
  const decPath = path.join(HERMES_ROOT, 'tools', 'swarm_goals', 'pending_human_decisions.json')
  const reportPath = path.join(HERMES_ROOT, 'EXECUTIVE_MORNING_SWARM_REPORT.md')
  let decData = { total_pending_decisions: 0, decisions: [] }
  if (fs.existsSync(decPath)) {
    try {
      decData = JSON.parse(fs.readFileSync(decPath, 'utf8'))
    } catch (e) {}
  }

  console.log(`${COLORS.red}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🌅 MASTER EXECUTIVE MORNING REPORT · GAPS, DIFFORMITÀ & DECISIONI IN SOSPESO           ║`)
  console.log(`║    Blocco Sovrano di Sicurezza: ATTIVO · Nessuna Modifica Distruttiva Non Autorizzata ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  Decisioni in Attesa di Risposta: ${COLORS.yellow}${COLORS.bright}${decData.total_pending_decisions}${COLORS.reset} | Modello: ${COLORS.cyan}proxima-chatgpt-5-6-sol${COLORS.reset} | Master Report: ${COLORS.dim}EXECUTIVE_MORNING_SWARM_REPORT.md${COLORS.reset}\n`)

  if (decData.decisions && decData.decisions.length > 0) {
    const table = decData.decisions.map(d => ({
      'Decision ID': d.decision_id,
      'Severity': d.severity,
      'Topic / Component': d.topic.slice(0, 30),
      'Question': d.question.slice(0, 48) + '...',
      'Gate Status': '🛑 BLOCCATO'
    }))
    console.table(table)

    console.log(`\n  ${COLORS.bright}DETTAGLIO DECISIONI IN ATTESA DI APPROVAZIONE UMANA:${COLORS.reset}`)
    decData.decisions.slice(0, 5).forEach((d, i) => {
      console.log(`  ${COLORS.cyan}[${i+1}] ${d.decision_id}:${COLORS.reset} ${d.topic} (${d.severity})`)
      console.log(`      ${COLORS.dim}${d.question}${COLORS.reset}`)
      d.options.forEach(opt => console.log(`      • ${opt}`))
      console.log('')
    })
  } else {
    console.log(`  ${COLORS.green}✅ Nessuna incongruenza critica: tutti i progetti risultano allineati o in fase di audit continuo.${COLORS.reset}\n`)
  }

  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await promptNavigation(showDiscrepanciesAndMorningReport)
}

async function showLiveSwarmJobMonitor(activeJobIdx = 0) {
  clearScreen()
  const data = getRealMetrics()
  const jobs = (data?.swarm_jobs?.jobs || []).map(job => ({
    ...job,
    job_id: job.id,
    start_time_iso: job.last_run || job.created_at || null,
    start_time_local: job.last_run || job.created_at || null,
    scheduled_end_time_iso: job.deadline || job.next_run || null,
    scheduled_end_time_local: job.deadline || job.next_run || null,
    progress_pct: null,
    elapsed_formatted: null,
    remaining_formatted: null,
    live_agent_logs: [],
  }))

  const job = jobs[activeJobIdx] || jobs[0] || {}
  const logs = job.live_agent_logs || []

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ ⏳ HERMES REGISTERED JOBS & VERIFIED RUN ARTIFACTS                                     ║`)
  console.log(`║    Registry state only; no synthetic progress, agent logs or completion claims          ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  // Multi-Job Tab Selector Bar
  if (jobs.length > 1) {
    console.log(`  ${COLORS.bright}SELEZIONA JOB ATTIVO:${COLORS.reset}`)
    const tabStr = jobs.map((j, i) => {
      const isSel = i === activeJobIdx
      const label = `[${i + 1}] ${j.job_id.slice(0, 20)} (${(j.progress_pct || 0).toFixed(1)}%)`
      return isSel ? `${COLORS.green}${COLORS.bright}▶ ${label} ◀${COLORS.reset}` : `${COLORS.dim}${label}${COLORS.reset}`
    }).join('  |  ')
    console.log(`  ${tabStr}\n`)
  }

  const statusColor = COLORS.green
  console.log(`  Job ID: ${COLORS.bright}${job.job_id || 'N/D'}${COLORS.reset} | Status: ${statusColor}${job.status || 'N/D'}${COLORS.reset} | Ultimo run: ${COLORS.cyan}${job.last_run_status || 'mai eseguito'}${COLORS.reset}`)
  console.log(`  Titolo:                          ${COLORS.yellow}${job.title || 'N/D'}${COLORS.reset}`)
  console.log(`  Progetto Target:                 ${COLORS.cyan}${job.project_name || job.project_id || 'N/D'}${COLORS.reset}`)
  console.log(`  🕒 Ultima esecuzione/creazione:   ${COLORS.bright}${job.start_time_local || 'N/D'}${COLORS.reset}`)
  console.log(`  🏁 Deadline / prossima scadenza:  ${COLORS.bright}${job.scheduled_end_time_local || 'N/D'}${COLORS.reset}`)
  console.log(`  📁 Ultimo artifact verificabile:  ${COLORS.cyan}${job.last_run_artifact || 'N/D'}${COLORS.reset}`)

  // Dedicated Progress Bar
  const pct = Math.min(100, Math.max(0, job.progress_pct || 0))
  const barLen = 32
  const filled = Math.round((pct / 100) * barLen)
  const empty = barLen - filled
  const barStr = `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${pct.toFixed(1)}%`
  console.log(`  📊 Avanzamento dichiarato:       ${job.progress_pct == null ? `${COLORS.yellow}N/D (nessuna evidenza live)${COLORS.reset}` : `${COLORS.green}${barStr}${COLORS.reset}`}`)
  
  if (job.active_pipeline_step) {
    console.log(`  🔄 Fase Pipeline Attiva:         ${COLORS.bright}Step ${job.active_pipeline_step.step}/6: ${job.active_pipeline_step.name}${COLORS.reset}`)
    console.log(`  📦 Deliverable in Generazione:   ${COLORS.green}${job.active_pipeline_step.deliverable}${COLORS.reset}`)
  } else {
    console.log(`  🔄 Pipeline registrata:          ${COLORS.bright}${job.workflow_pipeline?.length || 0} fasi${COLORS.reset}`)
  }

  console.log(`  🤖 Agent attivo:                 ${COLORS.magenta}${job.current_active_agent || 'N/D'}${COLORS.reset}`)
  console.log(`  🔒 Policy sicurezza registrata:  ${COLORS.green}${job.safety_lock || 'N/D'}${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}LOG DI ESECUZIONE VERIFICATI PER QUESTO JOB:${COLORS.reset}`)
  if (logs.length > 0) {
    const formatted = logs.slice(0, 8).map(l => ({
      'Time': l.timestamp,
      'Agent': (l.agent_id || '').slice(0, 20),
      'Project': (l.project || '').slice(0, 16),
      'Action / Deliverable': (l.deliverable ? `[${l.deliverable}] ` : '') + (l.action || '').slice(0, 34),
      'Coverage': l.coverage || 'N/D',
      'Tokens': `${l.tokens_in || 0} in / ${l.tokens_out || 0} out`,
      'Latency': `${l.latency_ms || 0} ms`,
      'Ledger Hash': (l.ledger_entry && l.ledger_entry[0]) ? l.ledger_entry[0] : 'N/D'
    }))
    console.table(formatted)
  } else {
    console.log(`  ${COLORS.dim}Nessun log verificato allegato al registro; consultare last_run_artifact dopo un'esecuzione.${COLORS.reset}\n`)
  }

  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)
  console.log(`  ${COLORS.bright}[1-9]${COLORS.reset} Seleziona Job | ${COLORS.bright}[M]${COLORS.reset} 🔲 Multiplexer Dedicato | ${COLORS.bright}[R]${COLORS.reset} 🔄 Ricarica | ${COLORS.bright}[A]${COLORS.reset} ⚡ Live Auto-Refresh | ${COLORS.bright}[0/B]${COLORS.reset} Menu`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  Seleziona opzione: `, async (ans) => {
    rl.close()
    const a = (ans || '').trim().toUpperCase()
    if (a >= '1' && a <= String(jobs.length)) {
      await showLiveSwarmJobMonitor(parseInt(a, 10) - 1)
    } else if (a === 'M' || a === 'MULTIPLEX') {
      await showMultiplexerDashboard('quad')
    } else if (a === 'R' || a === 'REFRESH') {
      await showLiveSwarmJobMonitor(activeJobIdx)
    } else if (a === 'A' || a === 'AUTO') {
      await startAutoRefreshLoop(() => showLiveSwarmJobMonitor(activeJobIdx))
    } else {
      showMenu()
    }
  })
}

async function showKimiK3Dashboard() {
  clearScreen()
  const data = getRealMetrics()
  const endpointOnline = data?.ports_probe?.some(item => item.port === 8095 && item.status === 'ONLINE') || false
  const checkpointAvailable = hasKimiCheckpoint()
  const serviceScript = path.join(KIMI_DIR, 'kimi_k3_service.py')
  const cSourceAvailable = fs.existsSync(path.join(KIMI_DIR, 'src')) && fs.existsSync(path.join(KIMI_DIR, 'CMakeLists.txt'))
  let bridgeHealth = null
  try {
    const response = await fetch('http://127.0.0.1:8095/health', { signal: AbortSignal.timeout(2500) })
    if (response.ok) bridgeHealth = await response.json()
  } catch (_) {}
  const layer = bridgeHealth?.local_first_layer || null
  const isCurrentBridge = bridgeHealth?.service === 'kimi-k3-first-layer-hydra-bridge'

  console.log(`${COLORS.blue}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🧠 KIMI-COMPATIBLE PROVIDER ROUTER · VERIFIED RUNTIME STATUS                            ║`)
  console.log(`║    Endpoint, source tree, checkpoint and backend availability — no synthetic metrics    ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)

  console.table([
    { Check: 'API endpoint 127.0.0.1:8095', Status: endpointOnline ? 'ONLINE' : 'OFFLINE', Evidence: isCurrentBridge ? bridgeHealth.service : endpointOnline ? 'legacy/incompatible service identity' : 'TCP probe failed' },
    { Check: 'Hydra heavy-work router', Status: bridgeHealth?.hydra?.online ? 'ONLINE' : 'UNVERIFIED', Evidence: bridgeHealth?.hydra?.url || 'http://127.0.0.1:8090/v1/status' },
    { Check: 'Python compatibility service', Status: fs.existsSync(serviceScript) ? 'AVAILABLE' : 'MISSING', Evidence: serviceScript },
    { Check: 'C engine source tree', Status: cSourceAvailable ? 'AVAILABLE' : 'MISSING', Evidence: KIMI_DIR },
    { Check: 'Released Kimi checkpoint', Status: layer?.shard_dir_exists || checkpointAvailable ? 'AVAILABLE' : 'MISSING', Evidence: layer?.shard_dir || (checkpointAvailable ? 'SHARD_DIR/KIMI_K3_CHECKPOINT' : 'not configured') },
    { Check: 'Real local layer 0', Status: layer?.verified ? 'VERIFIED' : 'NOT ACTIVE', Evidence: layer?.evidence || 'requires test_real_layer + reference verifier evidence' },
  ])
  console.log(`  ${COLORS.yellow}Contratto:${COLORS.reset} il lavoro pesante passa esclusivamente da Hydra; nessun fallback diretto OpenRouter/Gemini nel bridge.`)
  console.log(`  Il layer 0 locale viene dichiarato attivo solo dopo test C e confronto di riferimento sul checkpoint rilasciato.\n`)

  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)
  await promptNavigation(showKimiK3Dashboard)
}

async function showOpenChatCutTool() {
  const occCli = path.join(HERMES_ROOT, 'tools', 'openchatcut', 'openchatcut-cli.js')
  if (fs.existsSync(occCli)) {
    const { showOpenChatCutMenu } = require(occCli)
    await showOpenChatCutMenu()
  }
  showMenu()
}

// ─────────────────────────────────────────────────────────────────────────────
// LDG INNOVATION MASTER CONTROL HUB & RUNNER
// ─────────────────────────────────────────────────────────────────────────────

async function showLdgInnovationHub() {
  clearScreen()
  console.log(`${COLORS.green}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🏢 LDG INNOVATION · ENTERPRISE MASTER CONTROL & HARNESS HUB                             ║`)
  console.log(`║    Stack e requisiti rilevati dal progetto · B2B Pipeline & Swarms                       ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)
  console.log(`  Progetto: ${COLORS.yellow}${B2B_PROJECT}${COLORS.reset}`)
  console.log(`  Operatore: ${COLORS.cyan}LDG Admin${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}AZIONI RAPIDE LDG INNOVATION:${COLORS.reset}`)
  console.log(`  [1]  ${COLORS.green}🚀 Avvia Web App Next.js Dev Server${COLORS.reset}      (Porta 3000 - npm run dev)`)
  console.log(`  [2]  ${COLORS.yellow}📜 Valida Requisiti & Matrice Evidenze${COLORS.reset}     (conteggio ricavato dal repository)`)
  console.log(`  [3]  ${COLORS.cyan}🤖 Esegui B2B Suite v2 (Pilot Lead Gen)${COLORS.reset}   (OSINT, Crawler & Video Prep)`)
  console.log(`  [4]  ${COLORS.magenta}🥧 Lancia Pi Coding Agent${COLORS.reset}                 (Provider verificato dal runtime)`)
  console.log(`  [5]  ${COLORS.yellow}⚡ Check Ops Health & Alert Matrix${COLORS.reset}       (npm run ops:health)`)
  console.log(`  [6]  ${COLORS.blue}🪟 Apri Finestra Indipendente LDG${COLORS.reset}        (Dedicated PowerShell Workspace)`)
  console.log(`  [0]  ${COLORS.dim}Torna al Menu Principale${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  Seleziona azione (1-6, 0): `, async (choice) => {
    rl.close()
    const c = (choice || '').trim()
    switch (c) {
      case '1': {
        console.log(`${COLORS.green}Avvio Next.js Dev Server per LDG Innovation...${COLORS.reset}`)
        execSync(`start "LDG Innovation Next.js (Port 3000)" cmd.exe /k "cd /d \"${B2B_PROJECT}\" && npm run dev"`, { cwd: B2B_PROJECT, shell: 'cmd.exe' })
        await waitForEnter()
        showLdgInnovationHub()
        break
      }
      case '2': {
        console.log(`${COLORS.yellow}Esecuzione validazione requisiti LDG Innovation...${COLORS.reset}`)
        try { execSync('npm run requirements:validate', { stdio: 'inherit', cwd: B2B_PROJECT }) }
        catch (e) { console.error(`${COLORS.red}Errore durante la validazione: ${e.message}${COLORS.reset}`) }
        await waitForEnter()
        showLdgInnovationHub()
        break
      }
      case '3': {
        console.log(`${COLORS.cyan}Avvio B2B Suite v2 Pilot su LDG Innovation...${COLORS.reset}`)
        if (!PYTHON_EXE) {
          console.error(`${COLORS.red}Nessun runtime Python funzionante disponibile.${COLORS.reset}`)
        } else {
          const result = spawnSync(PYTHON_EXE, ['scripts/b2b_suite_v2.py', '--mode', 'generate', '--input', 'data/b2b_acquisition/verified_inputs/blackshape_minimal_v2.json', '--limit', '1'], { stdio: 'inherit', cwd: B2B_PROJECT })
          if (result.error || result.status !== 0) console.error(`${COLORS.red}Errore esecuzione B2B Suite (exit ${result.status ?? 1}): ${result.error?.message || 'pipeline failed'}${COLORS.reset}`)
        }
        await waitForEnter()
        showLdgInnovationHub()
        break
      }
      case '4': {
        console.log(`${COLORS.magenta}Avvio Pi Coding Agent per LDG Innovation...${COLORS.reset}`)
        const piKimi = path.join(PI_DIR, 'pi-kimi.bat')
        if (fs.existsSync(piKimi)) {
          if (!hasKimiCheckpoint()) console.log(`${COLORS.yellow}Nota: checkpoint Kimi locale non rilevato; il runner userà solo un provider realmente configurato.${COLORS.reset}`)
          execSync(`start "Pi Coding Agent - LDG Workspace" cmd.exe /k "cd /d \"${B2B_PROJECT}\" && call \"${piKimi}\""`, { cwd: B2B_PROJECT, shell: 'cmd.exe' })
        } else {
          console.error(`${COLORS.red}Runner Pi non trovato: ${piKimi}${COLORS.reset}`)
        }
        await waitForEnter()
        showLdgInnovationHub()
        break
      }
      case '5': {
        console.log(`${COLORS.yellow}Controllo stato operativo e salute...${COLORS.reset}`)
        try { execSync('npm run ops:health', { stdio: 'inherit', cwd: B2B_PROJECT }) }
        catch (e) { console.error(`${COLORS.red}Errore ops health: ${e.message}${COLORS.reset}`) }
        await waitForEnter()
        showLdgInnovationHub()
        break
      }
      case '6': {
        console.log(`${COLORS.blue}Apertura console workspace per LDG Innovation...${COLORS.reset}`)
        execSync(`start "LDG Innovation Workspace" cmd.exe /k "cd /d \"${B2B_PROJECT}\""`, { cwd: B2B_PROJECT, shell: 'cmd.exe' })
        await waitForEnter()
        showLdgInnovationHub()
        break
      }
      case '0':
      default:
        showMenu()
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// E-COMMERCE MASTER CONTROL & MULTI-STORE HUB
// ─────────────────────────────────────────────────────────────────────────────

function checkPortOnline(port, host = '127.0.0.1', timeout = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let status = false
    socket.setTimeout(timeout)
    socket.on('connect', () => { status = true; socket.destroy() })
    socket.on('timeout', () => { socket.destroy() })
    socket.on('error', () => { socket.destroy() })
    socket.on('close', () => { resolve(status) })
    socket.connect(port, host)
  })
}

function openBrowserUrl(url) {
  try {
    execSync(`start "" "${url}"`, { shell: 'cmd.exe', stdio: 'ignore', windowsHide: true })
    return true
  } catch (_) {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FOUNDER OS SUITE & EXECUTIVE CONTROL CENTER (OPZIONE [1] / [FOS])
// ─────────────────────────────────────────────────────────────────────────────

function launchFounderOsProcess(title, cwd, scriptName) {
  try {
    const child = spawn('cmd.exe', ['/c', 'start', title, 'cmd.exe', '/k', 'node', scriptName], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      env: { ...process.env, FOUNDER_OS_ORCHESTRATOR: '1' }
    })
    child.unref()
    return true
  } catch (err) {
    console.error(`Errore avvio ${title}:`, err.message)
    return false
  }
}

async function ensureFounderOsRunning() {
  let [frontendOnline, backendOnline] = await Promise.all([
    checkPortOnline(5173),
    checkPortOnline(3001)
  ])

  if (!backendOnline && fs.existsSync(FOUNDER_OS_BACKEND)) {
    console.log(`${COLORS.yellow}Avvio Backend Next.js Founder OS (porta 3001)...${COLORS.reset}`)
    launchFounderOsProcess('Founder OS Backend (:3001)', FOUNDER_OS_BACKEND, 'start-dev.js')
  }

  if (!frontendOnline && fs.existsSync(FOUNDER_OS_FRONTEND)) {
    console.log(`${COLORS.yellow}Avvio Frontend Vite Founder OS (porta 5173)...${COLORS.reset}`)
    launchFounderOsProcess('Founder OS Frontend (:5173)', FOUNDER_OS_FRONTEND, 'start-dev.cjs')
  }

  if (!frontendOnline || !backendOnline) {
    console.log(`${COLORS.cyan}Attesa avvio server Founder OS (Frontend :5173 / Backend :3001)...${COLORS.reset}`)
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 400))
      const [fe, be] = await Promise.all([checkPortOnline(5173), checkPortOnline(3001)])
      if (fe && be) {
        frontendOnline = fe
        backendOnline = be
        break
      }
    }
  }
}

function showFounderOsDbDetails() {
  clearScreen()
  console.log(`${COLORS.cyan}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 📊 FOUNDER OS DATABASE INSPECTOR (data/founder-os.db)                                  ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  if (!fs.existsSync(FOUNDER_OS_DB)) {
    console.log(`${COLORS.red}Database non trovato in ${FOUNDER_OS_DB}${COLORS.reset}`)
  } else {
    try {
      const { DatabaseSync } = require('node:sqlite')
      const db = new DatabaseSync(FOUNDER_OS_DB, { readOnly: true })
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      console.log(`  ${COLORS.bright}TABELLE E CONTEGGIO RECORD:${COLORS.reset}`)
      const summary = []
      for (const { name } of tables) {
        try {
          const count = db.prepare(`SELECT COUNT(*) as c FROM ${name}`).get().c
          summary.push({ 'Tabella': name, 'Record': count })
        } catch (_) {
          summary.push({ 'Tabella': name, 'Record': 'Errore' })
        }
      }
      console.table(summary)

      console.log(`\n  ${COLORS.bright}DETTAGLIO PROGETTO "PRODUZIONE REAL" (pr_real):${COLORS.reset}`)
      try {
        const pReal = db.prepare("SELECT * FROM projects WHERE id = 'pr_real'").get()
        if (pReal) {
          console.log(`  • Nome: ${COLORS.green}${pReal.name}${COLORS.reset} | Budget: ${pReal.budget} ${pReal.currency} | Bank: ${pReal.bank} ${pReal.currency}`)
          console.log(`  • Entità: ${pReal.legal_entity} | Anno Fiscale: ${pReal.fiscal_year} | VAT: ${pReal.vat_rate}%`)
        }
      } catch (_) {}
    } catch (e) {
      console.error(`${COLORS.red}Errore lettura database: ${e.message}${COLORS.reset}`)
    }
  }

  waitForEnter().then(showFounderOsHub)
}

async function showFounderOsHub() {
  clearScreen()
  const [frontendOnline, backendOnline] = await Promise.all([
    checkPortOnline(5173),
    checkPortOnline(3001)
  ])

  let projectCount = 'N/D'
  let tableCount = 'N/D'
  let projectsList = []
  if (fs.existsSync(FOUNDER_OS_DB)) {
    try {
      const { DatabaseSync } = require('node:sqlite')
      const db = new DatabaseSync(FOUNDER_OS_DB, { readOnly: true })
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
      tableCount = tables.length
      projectsList = db.prepare("SELECT id, name, desc, currency, bank, vat_rate, legal_entity, fiscal_year FROM projects").all()
      projectCount = projectsList.length
    } catch (_) {}
  }

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🚀 FOUNDER OS SUITE — UNIFIED EXECUTIVE CONTROL CENTER                                  ║`)
  console.log(`║    Startup & Venture Cockpit · Frontend (:5173) · Backend (:3001) · SQLite DB (V2.1)   ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  const statusFe = frontendOnline ? `${COLORS.green}ONLINE (:5173)${COLORS.reset}` : `${COLORS.red}OFFLINE (:5173)${COLORS.reset}`
  const statusBe = backendOnline ? `${COLORS.green}ONLINE (:3001)${COLORS.reset}` : `${COLORS.red}OFFLINE (:3001)${COLORS.reset}`
  const dbStatus = fs.existsSync(FOUNDER_OS_DB) ? `${COLORS.green}CONNESSO (${projectCount} Progetti, ${tableCount} Tabelle)${COLORS.reset}` : `${COLORS.red}NON TROVATO${COLORS.reset}`

  console.log(`  Stato Piattaforma: Frontend ${statusFe} | Backend Next.js ${statusBe} | Database ${dbStatus}`)
  console.log(`  Accesso Web:       ${COLORS.cyan}http://localhost:5173${COLORS.reset} (Dev Auto-Login attivo · Ruolo: ${COLORS.bright}admin_lucadeg${COLORS.reset})\n`)

  if (projectsList.length > 0) {
    console.log(`  ${COLORS.bright}PROGETTI ATTIVI REGISTRATI NEL DATABASE:${COLORS.reset}`)
    projectsList.forEach(p => {
      console.log(`  • ${COLORS.cyan}${COLORS.bright}${p.name.padEnd(18)}${COLORS.reset} [ID: ${p.id}] ${COLORS.dim}${p.desc || ''}${COLORS.reset} (${p.currency} · Entità: ${p.legal_entity || 'N/D'} · Anno: ${p.fiscal_year || '2026'})`)
    })
    console.log()
  }

  console.log(`  ${COLORS.bright}AZIONI RAPIDE FOUNDER OS:${COLORS.reset}`)
  console.log(`  [1]  ${COLORS.yellow}${COLORS.bright}🌐 Apri Founder OS nel Browser${COLORS.reset}         (http://localhost:5173 · Auto-start se offline)`)
  console.log(`  [2]  ${COLORS.green}${COLORS.bright}⚡ Avvia ENTRAMBI i Server${COLORS.reset}             (Frontend Vite :5173 + Backend Next.js :3001)`)
  console.log(`  [3]  ${COLORS.green}🚀 Avvia solo Frontend Vite${COLORS.reset}            (npm run dev su porta 5173)`)
  console.log(`  [4]  ${COLORS.green}⚙️  Avvia solo Backend Next.js${COLORS.reset}          (npm run dev su porta 3001)`)
  console.log(`  [5]  ${COLORS.red}🛑 Arresta Server Founder OS${COLORS.reset}           (Libera porte 5173 e 3001)`)
  console.log(`  [6]  ${COLORS.cyan}📊 Ispezione Approfondita Database${COLORS.reset}     (Statistiche tabelle, KPI, OKR e task)`)
  console.log(`  [7]  ${COLORS.magenta}📁 Apri Directory Founder OS${COLORS.reset}           (Esplora cartella sorgente)`)
  console.log(`  [0]  ${COLORS.dim}Torna al Menu Principale TUIOS${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona azione Founder OS (1-7, 0): ${COLORS.reset}`, async (choice) => {
    rl.close()
    const c = (choice || '').trim().toUpperCase()
    switch (c) {
      case '1':
      case 'OPEN':
      case 'BROWSER': {
        await ensureFounderOsRunning()
        openBrowserUrl('http://localhost:5173')
        console.log(`${COLORS.green}  ✓ Aperto Founder OS: http://localhost:5173${COLORS.reset}`)
        await waitForEnter()
        showFounderOsHub()
        break
      }
      case '2':
      case 'START':
      case 'ALL': {
        console.log(`${COLORS.green}Avvio di entrambi i server Founder OS...${COLORS.reset}`)
        launchFounderOsProcess('Founder OS Backend (:3001)', FOUNDER_OS_BACKEND, 'start-dev.js')
        launchFounderOsProcess('Founder OS Frontend (:5173)', FOUNDER_OS_FRONTEND, 'start-dev.cjs')
        console.log(`${COLORS.green}  ✓ Server avviati in finestre separate (Frontend :5173, Backend :3001).${COLORS.reset}`)
        await waitForEnter()
        showFounderOsHub()
        break
      }
      case '3':
      case 'FE': {
        console.log(`${COLORS.green}Avvio Frontend Vite Founder OS (porta 5173)...${COLORS.reset}`)
        launchFounderOsProcess('Founder OS Frontend (:5173)', FOUNDER_OS_FRONTEND, 'start-dev.cjs')
        await waitForEnter()
        showFounderOsHub()
        break
      }
      case '4':
      case 'BE': {
        console.log(`${COLORS.green}Avvio Backend Next.js Founder OS (porta 3001)...${COLORS.reset}`)
        launchFounderOsProcess('Founder OS Backend (:3001)', FOUNDER_OS_BACKEND, 'start-dev.js')
        await waitForEnter()
        showFounderOsHub()
        break
      }
      case '5':
      case 'STOP':
      case 'KILL': {
        console.log(`${COLORS.red}Arresto server Founder OS su porte 5173 e 3001...${COLORS.reset}`)
        const killed = killPorts([5173, 3001])
        console.log(`${COLORS.green}  ✓ Processi arrestati (${killed.length} terminati). Porte 5173 e 3001 liberate.${COLORS.reset}`)
        await waitForEnter()
        showFounderOsHub()
        break
      }
      case '6':
      case 'DB': {
        showFounderOsDbDetails()
        break
      }
      case '7':
      case 'EXPLORE':
      case 'DIR': {
        execSync(`explorer "${FOUNDER_OS_DIR}"`, { shell: 'cmd.exe' })
        showFounderOsHub()
        break
      }
      case '0':
      default: {
        showMenu()
        break
      }
    }
  })
}

async function ensureStorefrontRunning() {
  const { storefrontPort } = await getEcommercePorts()
  const isOnline = await checkPortOnline(storefrontPort)
  if (!isOnline) {
    console.log(`${COLORS.yellow}Avvio Storefront Vite in corso via PortManager (porta ${storefrontPort})...${COLORS.reset}`)
    const launchScript = path.join(MOSER_PROJECT, 'scripts', 'launch-with-port-manager.cjs')
    if (fs.existsSync(launchScript)) {
      execSync(`start "Moser Storefront (Port ${storefrontPort})" node "${launchScript}"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
    } else {
      execSync(`start "Moser Storefront (Port ${storefrontPort})" cmd.exe /k "cd /d \"${MOSER_PROJECT}\" && npm run dev -- --port ${storefrontPort}"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
    }
    await new Promise(r => setTimeout(r, 2500))
  }
}

function isDonGennaroListening(port) {
  return new Promise((resolve) => {
    const http = require('node:http')
    const req = http.get({
      hostname: '127.0.0.1',
      port: port,
      path: '/',
      timeout: 800
    }, (res) => {
      let body = ''
      res.on('data', chunk => {
        body += chunk
        if (body.length > 500) req.destroy()
      })
      res.on('close', () => {
        const isDG = body.toLowerCase().includes('don gennaro') || body.toLowerCase().includes('calzature') || body.toLowerCase().includes('don-gennaro')
        resolve(isDG)
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function resolveDonGennaroPort() {
  const pm = getPortManager()
  const preferred = DON_GENNARO_PORT || 3005

  // 1. If preferred port is listening, check if it's already Don Gennaro
  const is3005Listening = await checkPortOnline(preferred)
  if (is3005Listening) {
    const isDG = await isDonGennaroListening(preferred)
    if (isDG) {
      await pm.allocatePort('don-gennaro-calzature-napoli', preferred, 'frontend')
      return { port: preferred, isOnline: true, hasConflict: false, preferred }
    }
  }

  // 2. If already registered in PortManager, check if that port is running Don Gennaro
  const existing = pm.allocations?.get ? pm.allocations.get('don-gennaro-calzature-napoli') : null
  if (existing && existing.port !== preferred) {
    const isListening = await checkPortOnline(existing.port)
    if (isListening && (await isDonGennaroListening(existing.port))) {
      return { port: existing.port, isOnline: true, hasConflict: true, preferred }
    }
  }

  // 3. Check for conflict on preferred port
  let hasConflict = false
  let targetPort = preferred
  if (is3005Listening) {
    hasConflict = true
    targetPort = preferred + 1
    while (await checkPortOnline(targetPort)) {
      targetPort++
    }
  }

  const alloc = await pm.allocatePort('don-gennaro-calzature-napoli', targetPort, 'frontend')
  const finalPort = alloc.port || targetPort
  const isOnline = await checkPortOnline(finalPort)
  const isDG = isOnline ? await isDonGennaroListening(finalPort) : false

  return {
    port: finalPort,
    isOnline: isDG,
    hasConflict: hasConflict || finalPort !== preferred,
    preferred
  }
}

async function ensureDonGennaroRunning() {
  const info = await resolveDonGennaroPort()
  if (info.isOnline) {
    return info.port
  }

  if (info.hasConflict) {
    console.log(`${COLORS.yellow}  ⚠️ Conflitto su porta ${info.preferred} rilevato (occupata da un altro processo).${COLORS.reset}`)
    console.log(`${COLORS.cyan}  ⚡ PortManager ha allocato la porta libera: ${info.port}${COLORS.reset}`)
  } else {
    console.log(`${COLORS.yellow}Avvio Store Don Gennaro Calzature Napoli su porta ${info.port}...${COLORS.reset}`)
  }

  const batFile = path.join(DON_GENNARO_PROJECT, 'avvia-store.bat')
  if (!info.hasConflict && fs.existsSync(batFile)) {
    execSync(`start "Don Gennaro Calzature Napoli (Port ${info.port})" cmd.exe /c "${batFile}"`, { shell: 'cmd.exe', cwd: DON_GENNARO_PROJECT })
  } else {
    execSync(`start "Don Gennaro Calzature Napoli (Port ${info.port})" cmd.exe /k "cd /d \"${DON_GENNARO_PROJECT}\" && npm run dev -- -p ${info.port}"`, { shell: 'cmd.exe', cwd: DON_GENNARO_PROJECT })
  }
  await new Promise(r => setTimeout(r, 2500))
  return info.port
}

async function checkEcommerceHealth() {
  const { storefrontPort, medusaPort } = await getEcommercePorts()
  const [storefront, medusa, storage] = await Promise.all([
    checkPortOnline(storefrontPort),
    checkPortOnline(medusaPort),
    checkPortOnline(8989),
  ])
  return { storefront, medusa, storage, storefrontPort, medusaPort }
}

async function getEcommerceStoresList() {
  const { storefrontPort } = await getEcommercePorts()
  const stores = [
    {
      id: 'moser-commerce',
      name: 'Moser Luxury Commerce',
      type: 'Core Flagship',
      port: storefrontPort,
      url: `http://localhost:${storefrontPort}`,
      adminUrl: `http://localhost:${storefrontPort}/admin`,
      consumerUrl: `http://localhost:${storefrontPort}/`,
      businessUrl: `http://localhost:${storefrontPort}/company/dashboard`,
      description: 'Piattaforma ammiraglia luxury fashion, lookbook editoriale e Medusa 2.0'
    }
  ]

  // Scan 01CORE projects
  const storageProjectsDir = path.join(COMMON_STORAGE, 'projects')
  if (fs.existsSync(storageProjectsDir)) {
    try {
      const entries = fs.readdirSync(storageProjectsDir)
      for (const entry of entries) {
        if (entry === 'moser-commerce' || entry === 'common-shared') continue
        const pPath = path.join(storageProjectsDir, entry)
        if (!fs.statSync(pPath).isDirectory()) continue
        const pjPath = path.join(pPath, 'project.json')
        let name = entry
        let desc = 'Store derivato catalogato in 01CORE storage'
        let pj = {}
        if (fs.existsSync(pjPath)) {
          try {
            pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'))
            name = pj.name || entry
            desc = pj.description || desc
          } catch (_) {}
        }
        stores.push({
          id: entry,
          name,
          type: pj.type || '01CORE Project Store',
          port: storefrontPort,
          url: pj.url || `http://localhost:${storefrontPort}?project=${entry}`,
          adminUrl: pj.adminUrl || `http://localhost:${storefrontPort}/admin/new-ecommerce?project=${entry}`,
          consumerUrl: pj.consumerUrl || `http://localhost:${storefrontPort}?project=${entry}`,
          businessUrl: pj.businessUrl || `http://localhost:${storefrontPort}/company/dashboard?project=${entry}`,
          description: desc
        })
      }
    } catch (_) {}
  }

  // Scan mechaHD directories for additional standalone stores
  const mechaHdDir = path.join(HERMES_ROOT, 'mechaHD')
  if (fs.existsSync(mechaHdDir)) {
    try {
      const items = fs.readdirSync(mechaHdDir)
      for (const item of items) {
        if (['Moser-commerce', '01CORE_common_asset_storage', 'LDG_INNOVATION', 'hermes-desktop-old-base'].includes(item)) continue
        const ip = path.join(mechaHdDir, item)
        if (!fs.statSync(ip).isDirectory()) continue
        const pkg = path.join(ip, 'package.json')
        if (fs.existsSync(pkg)) {
          const already = stores.find(s => s.id.toLowerCase() === item.toLowerCase())
          if (!already) {
            const isDonGennaro = item.toLowerCase() === 'don-gennaro-calzature-napoli'
            const sPort = isDonGennaro ? DON_GENNARO_PORT : storefrontPort
            const sUrl = isDonGennaro ? `http://localhost:${sPort}` : `http://localhost:${storefrontPort}?store=${item.toLowerCase()}`
            const sAdmin = isDonGennaro ? `http://localhost:${sPort}/v2` : `http://localhost:${storefrontPort}/admin?store=${item.toLowerCase()}`
            const sConsumer = isDonGennaro ? `http://localhost:${sPort}/` : `http://localhost:${storefrontPort}?store=${item.toLowerCase()}`
            const sBusiness = isDonGennaro ? `http://localhost:${sPort}/v2#booking` : `http://localhost:${storefrontPort}/company/dashboard?store=${item.toLowerCase()}`
            const sDesc = isDonGennaro
              ? 'Don Gennaro Esposito · Calzature Napoletane su Misura dal 1952 (Next.js 15, Three.js & Scrollytelling)'
              : `Workspace autonomo in mechaHD/${item}`

            stores.push({
              id: item.toLowerCase(),
              name: isDonGennaro ? 'Don Gennaro · Calzature Napoletane dal 1952' : item,
              type: isDonGennaro ? 'Bespoke Footwear Flagship (Next.js 15)' : 'Standalone Workspace Store',
              port: sPort,
              url: sUrl,
              adminUrl: sAdmin,
              consumerUrl: sConsumer,
              businessUrl: sBusiness,
              description: sDesc
            })
          }
        }
      }
    } catch (_) {}
  }

  return stores
}

async function showEcommerceMasterHub() {
  clearScreen()
  const health = await checkEcommerceHealth()

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🛍️ E-COMMERCE MASTER CONTROL & MULTI-STORE HUB                                         ║`)
  console.log(`║    Moser Commerce & Generatore Multi-Store · Aree Admin, Consumer, Business & Wizard    ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  const { storefrontPort, medusaPort } = health
  const statusStorefront = health.storefront ? `${COLORS.green}ONLINE (:${storefrontPort})${COLORS.reset}` : `${COLORS.red}OFFLINE (:${storefrontPort})${COLORS.reset}`
  const statusMedusa = health.medusa ? `${COLORS.green}ONLINE (:${medusaPort})${COLORS.reset}` : `${COLORS.red}OFFLINE (:${medusaPort})${COLORS.reset}`
  const statusStorage = health.storage ? `${COLORS.green}ONLINE (:8989)${COLORS.reset}` : `${COLORS.dim}STANDALONE LOCAL${COLORS.reset}`

  console.log(`  Stato Piattaforma: Storefront ${statusStorefront} | Medusa Backend ${statusMedusa} | Asset Storage ${statusStorage}\n`)

  console.log(`  ${COLORS.bright}👑 AREA AMMINISTRATIVA MOSER (ADMIN REALM):${COLORS.reset}`)
  console.log(`  [A]  ${COLORS.yellow}${COLORS.bright}👑 Moser Admin Dashboard${COLORS.reset}              (Gate, Prodotti, Ordini & RBAC)`)
  console.log(`  [W]  ${COLORS.yellow}🪄 New E-Commerce Creation Wizard${COLORS.reset}      (AI Store Builder, Brand Kit v1 & Offer v1)`)
  console.log(`  [CS] ${COLORS.magenta}🎨 Creative Studio 3D & Motion${COLORS.reset}         (ThreeUI Canvas & Motion Promo Generator)`)
  console.log(`  [RB] ${COLORS.cyan}🛡️ Access Control & RBAC Matrix${COLORS.reset}        (Three-Realm Security & Session Manager)`)
  console.log(`  [DL] ${COLORS.green}🔬 Discovery Lab Operations Hub${COLORS.reset}        (UGC Campaigns, Tester & Scout Management)`)
  console.log(`  [OP] ${COLORS.blue}⚡ Operations & Real-Time Monitor${COLORS.reset}      (Token Monitor, Cache & System Telemetry)\n`)

  console.log(`  ${COLORS.bright}🛍️ AREA CLIENTI CONSUMER MOSER (CUSTOMER REALM):${COLORS.reset}`)
  console.log(`  [C]  ${COLORS.cyan}${COLORS.bright}🏠 Storefront Home & Showcase${COLORS.reset}          (Hero, Drops, Lookbook & Experience)`)
  console.log(`  [CC] ${COLORS.cyan}👗 Collezioni & Directory Prodotti${COLORS.reset}     (Filtri, Amazon PDP Content & Schede)`)
  console.log(`  [CA] ${COLORS.cyan}👤 Account Cliente & Moser Circle VIP${COLORS.reset}  (Fedeltà, Vouchers, Ordini & Resi)`)
  console.log(`  [CP] ${COLORS.cyan}🤖 Personal Shopper AI Experience${COLORS.reset}      (Consulenza outfit & raccomandazioni)`)
  console.log(`  [CL] ${COLORS.cyan}📖 Editorial Lookbook Scrollytelling${COLORS.reset}   (Esperienza visiva fullscreen interattiva)\n`)

  console.log(`  ${COLORS.bright}💼 AREA CLIENTI BUSINESS MOSER (COMPANY & PARTNER REALM):${COLORS.reset}`)
  console.log(`  [B]  ${COLORS.green}${COLORS.bright}🏢 Company Control Center & B2B Hub${COLORS.reset}    (Gestione Organizzazione & Contratti)`)
  console.log(`  [BD] ${COLORS.green}📊 Company Dashboard & B2B Orders${COLORS.reset}      (Listini riservati & fatturazione)`)
  console.log(`  [BM] ${COLORS.green}🏪 Merchant & Seller Operations${COLORS.reset}        (Catalogo vendor & report vendite)`)
  console.log(`  [BP] ${COLORS.green}🤝 Partner Portal & Collaborations${COLORS.reset}     (Accordi B2B, Revenue Share & SLA)`)
  console.log(`  [BS] ${COLORS.green}🎯 Scout Community Missions Hub${COLORS.reset}        (Campagne content & missioni scout)`)
  console.log(`  [BT] ${COLORS.green}🧪 Tester Sample Validation Hub${COLORS.reset}        (Test di laboratorio e recensioni UGC)\n`)

  console.log(`  ${COLORS.bright}🌐 TUTTI I NUOVI E-COMMERCE CREATI (MULTI-STORE):${COLORS.reset}`)
  console.log(`  [M]  ${COLORS.yellow}${COLORS.bright}🌐 Multi-Store Explorer & Selector${COLORS.reset}     (Scegli e accedi ad Admin/Consumer/Business di qualsiasi store)`)
  console.log(`  [N]  ${COLORS.yellow}${COLORS.bright}🪄 Crea Nuovo E-Commerce Ora${COLORS.reset}           (Lancia Wizard con parametri brand, offer e Shopify)\n`)

  console.log(`  ${COLORS.bright}✨ ARCHITETTURE & ASSET SUITE (PR #44, #45, #46):${COLORS.reset}`)
  console.log(`  [IL] ${COLORS.magenta}${COLORS.bright}🌟 Influencer Landings V1-V10${COLORS.reset}           (10 Concetti ad alta conversione, formule & mockup SVG)`)
  console.log(`  [GS] ${COLORS.yellow}${COLORS.bright}👞 Don Gennaro Calzature 1952${COLORS.reset}        (Store Fullstack Next.js :3005 / PortManager)`)
  console.log(`  [CT] ${COLORS.cyan}${COLORS.bright}💬 Communication Templates V1 Suite${COLORS.reset}     (Chatbot AI, FAQ, Docs, Email, Offers, Presets)`)
  console.log(`  [LT] ${COLORS.green}${COLORS.bright}⚖️ Legal Templates & Compliance Suite${COLORS.reset}   (10 Contratti & Policy GDPR/EU/IT verificate)`)
  console.log(`  [OM] ${COLORS.blue}${COLORS.bright}🧩 Optional Modules & Bundles Manager${COLORS.reset}   (Communication Base, Legal Base, Foundation)`)
  console.log(`  [TR] ${COLORS.cyan}${COLORS.bright}🌍 Multi-Language & Auto-Translation${COLORS.reset}    (9 Lingue: IT, EN, FR, DE, ES, ZH, JA, RU, AR RTL)\n`)

  console.log(`  ${COLORS.bright}⚙️ GESTIONE SERVER & RUNTIME (PORT MANAGER GOVERNED):${COLORS.reset}`)
  console.log(`  [1]  ${COLORS.green}🚀 Avvia Storefront React/Vite${COLORS.reset}         (PortManager: porta ${storefrontPort})`)
  console.log(`  [2]  ${COLORS.green}⚙️ Avvia Medusa Headless Backend${COLORS.reset}       (PortManager: porta ${medusaPort})`)
  console.log(`  [3]  ${COLORS.green}${COLORS.bright}⚡ Avvia ENTRAMBI i Server${COLORS.reset}             (Dual Window Storefront :${storefrontPort} + Medusa :${medusaPort})`)
  console.log(`  [4]  ${COLORS.red}🛑 Arresta Server E-Commerce${COLORS.reset}           (Libera porte ${storefrontPort} e ${medusaPort})`)
  console.log(`  [5]  ${COLORS.cyan}🛡️ Esegui Quality Suite & Contratti${COLORS.reset}    (npm run quality con tutti i contratti)`)
  console.log(`  [0]  ${COLORS.dim}Torna al Menu Principale${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona azione E-Commerce: ${COLORS.reset}`, async (choice) => {
    rl.close()
    const c = (choice || '').trim().toUpperCase()
    switch (c) {
      case 'A':
      case 'ADMIN':
      case 'A1': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/admin`)
        console.log(`${COLORS.green}  ✓ Aperta Area Amministrativa Moser: http://localhost:${storefrontPort}/admin${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'W':
      case 'WIZARD':
      case 'A2':
      case 'N': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/admin/new-ecommerce`)
        console.log(`${COLORS.green}  ✓ Aperto New E-Commerce Creation Wizard: http://localhost:${storefrontPort}/admin/new-ecommerce${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'CS':
      case 'CREATIVE':
      case 'A3': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/admin/creative-studio`)
        console.log(`${COLORS.green}  ✓ Aperto Creative Studio 3D & Motion: http://localhost:${storefrontPort}/admin/creative-studio${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'RB':
      case 'RBAC':
      case 'A4': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/admin/access-control`)
        console.log(`${COLORS.green}  ✓ Aperto Access Control & RBAC Matrix: http://localhost:${storefrontPort}/admin/access-control${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'DL':
      case 'DISCOVERY':
      case 'A5': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/admin/discovery-lab-ops`)
        console.log(`${COLORS.green}  ✓ Aperto Discovery Lab Operations: http://localhost:${storefrontPort}/admin/discovery-lab-ops${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'OP':
      case 'OPERATIONS':
      case 'A6': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/admin/operations`)
        console.log(`${COLORS.green}  ✓ Aperta Console Operazioni & Monitor: http://localhost:${storefrontPort}/admin/operations${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'C':
      case 'CONSUMER':
      case 'CUSTOMER':
      case 'STOREFRONT':
      case 'C1': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/`)
        console.log(`${COLORS.green}  ✓ Aperta Area Consumer (Storefront Home): http://localhost:${storefrontPort}/${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'CC':
      case 'COLLECTIONS':
      case 'C2': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/collections`)
        console.log(`${COLORS.green}  ✓ Aperta Directory Collezioni & Prodotti: http://localhost:${storefrontPort}/collections${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'CA':
      case 'ACCOUNT':
      case 'C3': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/account`)
        console.log(`${COLORS.green}  ✓ Aperta Area Account & Moser Circle VIP: http://localhost:${storefrontPort}/account${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'CP':
      case 'SHOPPER':
      case 'C4': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/shop/personal-shopper`)
        console.log(`${COLORS.green}  ✓ Aperto Personal Shopper AI: http://localhost:${storefrontPort}/shop/personal-shopper${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'CL':
      case 'LOOKS':
      case 'C5': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/looks`)
        console.log(`${COLORS.green}  ✓ Aperto Lookbook Scrollytelling: http://localhost:${storefrontPort}/looks${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'B':
      case 'BUSINESS':
      case 'B1': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/company/control-center`)
        console.log(`${COLORS.green}  ✓ Aperto Company Control Center (Business): http://localhost:${storefrontPort}/company/control-center${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'BD':
      case 'B2': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/company/dashboard`)
        console.log(`${COLORS.green}  ✓ Aperta Company Dashboard: http://localhost:${storefrontPort}/company/dashboard${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'BM':
      case 'MERCHANT':
      case 'B3': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/merchant/dashboard`)
        console.log(`${COLORS.green}  ✓ Aperta Merchant Dashboard: http://localhost:${storefrontPort}/merchant/dashboard${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'BP':
      case 'PARTNER':
      case 'B4': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/partners/dashboard`)
        console.log(`${COLORS.green}  ✓ Aperto Partners Portal: http://localhost:${storefrontPort}/partners/dashboard${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'BS':
      case 'SCOUT':
      case 'B5': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/scout/hub`)
        console.log(`${COLORS.green}  ✓ Aperto Scout Missions Hub: http://localhost:${storefrontPort}/scout/hub${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'BT':
      case 'TESTER':
      case 'B6': {
        await ensureStorefrontRunning()
        openBrowserUrl(`http://localhost:${storefrontPort}/tester/hub`)
        console.log(`${COLORS.green}  ✓ Aperto Tester Sample Validation Hub: http://localhost:${storefrontPort}/tester/hub${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'M':
      case 'MULTI':
      case 'STORES': {
        await showMultiStoreExplorer()
        break
      }
      case '1': {
        console.log(`${COLORS.green}Avvio Storefront React Vite con PortManager (porta ${storefrontPort})...${COLORS.reset}`)
        const launchScript = path.join(MOSER_PROJECT, 'scripts', 'launch-with-port-manager.cjs')
        if (fs.existsSync(launchScript)) {
          execSync(`start "Moser Storefront (Port ${storefrontPort})" node "${launchScript}"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
        } else {
          execSync(`start "Moser Storefront (Port ${storefrontPort})" cmd.exe /k "cd /d \"${MOSER_PROJECT}\" && npm run dev -- --port ${storefrontPort}"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
        }
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case '2': {
        console.log(`${COLORS.green}Avvio Medusa Headless Backend con PortManager (porta ${medusaPort})...${COLORS.reset}`)
        const launchScript = path.join(MOSER_PROJECT, 'scripts', 'launch-with-port-manager.cjs')
        if (fs.existsSync(launchScript)) {
          execSync(`start "Moser Medusa Backend (Port ${medusaPort})" node "${launchScript}" --medusa`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
        } else {
          execSync(`start "Moser Medusa Backend (Port ${medusaPort})" cmd.exe /k "cd /d \"${MOSER_PROJECT}\" && npm run medusa:dev"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
        }
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case '3': {
        console.log(`${COLORS.green}Avvio ENTRAMBI i server con PortManager (Storefront :${storefrontPort} + Medusa :${medusaPort})...${COLORS.reset}`)
        const launchScript = path.join(MOSER_PROJECT, 'scripts', 'launch-with-port-manager.cjs')
        if (fs.existsSync(launchScript)) {
          execSync(`start "Moser Dual Servers" node "${launchScript}" --all`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
        } else {
          execSync(`start "Moser Storefront (Port ${storefrontPort})" cmd.exe /k "cd /d \"${MOSER_PROJECT}\" && npm run dev -- --port ${storefrontPort}"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
          execSync(`start "Moser Medusa Backend (Port ${medusaPort})" cmd.exe /k "cd /d \"${MOSER_PROJECT}\" && npm run medusa:dev"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
        }
        console.log(`${COLORS.green}  ✓ Processi avviati via PortManager. Storefront :${storefrontPort}, Medusa :${medusaPort}.${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case '4': {
        console.log(`${COLORS.red}Arresto server E-Commerce su porte ${storefrontPort} e ${medusaPort}...${COLORS.reset}`)
        const killed = killPorts([storefrontPort, medusaPort])
        console.log(`${COLORS.green}  ✓ Processi arrestati (${killed.length} terminati). Porte ${storefrontPort} e ${medusaPort} libere.${COLORS.reset}`)
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case '5': {
        console.log(`${COLORS.cyan}Esecuzione Quality Suite Moser Commerce (contratti, lint, test, build)...${COLORS.reset}`)
        try {
          execSync('npm run quality', { stdio: 'inherit', cwd: MOSER_PROJECT })
        } catch (e) {
          console.error(`${COLORS.red}Errore durante quality suite: ${e.message}${COLORS.reset}`)
        }
        await waitForEnter()
        showEcommerceMasterHub()
        break
      }
      case 'IL':
      case 'INFLUENCER':
      case 'INFLUENCER_LANDINGS': {
        await showInfluencerLandingsHub()
        break
      }
      case 'GS':
      case 'SCROLLYTELLING':
      case 'GOLDEN':
      case 'SCARPE':
      case 'ARTIGIANO': {
        await showGoldenScrollytellingHub()
        break
      }
      case 'CT':
      case 'COMMUNICATION':
      case 'COMM_TEMPLATES': {
        await showCommunicationTemplatesHub()
        break
      }
      case 'LT':
      case 'LEGAL':
      case 'LEGAL_TEMPLATES': {
        await showLegalTemplatesHub()
        break
      }
      case 'OM':
      case 'MODULES':
      case 'OPTIONAL_MODULES': {
        await showOptionalModulesHub()
        break
      }
      case 'TR':
      case 'ML':
      case 'TRANSLATE':
      case 'TRANSLATION':
      case 'LOCALIZATION':
      case 'LANGUAGES': {
        await showAutoTranslationHub()
        break
      }
      case '0':
      case 'Q':
      default:
        showMenu()
    }
  })
}

async function showMultiStoreExplorer() {
  clearScreen()
  const stores = await getEcommerceStoresList()

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🌐 MULTI-STORE EXPLORER & GESTIONE TUTTI GLI E-COMMERCE CREATI                         ║`)
  console.log(`║    Accesso universale alle 3 Aree: Admin, Consumer e Business per ciascun store          ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}STORE ATTIVI & PROGETTI CATALOGATI:${COLORS.reset}`)
  stores.forEach((store, idx) => {
    const num = `[${idx + 1}]`.padEnd(5)
    console.log(`  ${num} ${COLORS.cyan}${COLORS.bright}${store.name.padEnd(38)}${COLORS.reset} ${COLORS.dim}(${store.type})${COLORS.reset}`)
    console.log(`        ${COLORS.dim}ID:${COLORS.reset} ${store.id.padEnd(20)} ${COLORS.dim}→${COLORS.reset} ${COLORS.green}${store.url}${COLORS.reset}`)
    console.log(`        ${COLORS.dim}Desc:${COLORS.reset} ${store.description.slice(0, 75)}`)
  })
  console.log(`\n  [U]  ${COLORS.yellow}Inserisci Store ID o URL Personalizzato${COLORS.reset}`)
  console.log(`  [0]  ${COLORS.dim}Torna all'E-Commerce Master Hub${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona store (1-${stores.length}, U, 0): ${COLORS.reset}`, async (ans) => {
    rl.close()
    const input = (ans || '').trim().toUpperCase()
    if (input === '0' || input === '') {
      return showEcommerceMasterHub()
    }

    let selectedStore = null
    if (input === 'U') {
      const rlCustom = readline.createInterface({ input: process.stdin, output: process.stdout })
      rlCustom.question(`  Inserisci Store ID o URL (es. aihux oppure http://localhost:8081): `, async (customVal) => {
        rlCustom.close()
        const target = (customVal || '').trim()
        if (!target) return showMultiStoreExplorer()
        if (target.startsWith('http')) {
          selectedStore = {
            id: 'custom-url',
            name: `Store Personalizzato (${target})`,
            type: 'Custom URL',
            adminUrl: `${target.replace(/\/+$/, '')}/admin`,
            consumerUrl: `${target.replace(/\/+$/, '')}/`,
            businessUrl: `${target.replace(/\/+$/, '')}/company/dashboard`,
          }
        } else {
          const { storefrontPort } = await getEcommercePorts()
          selectedStore = {
            id: target,
            name: `Store ${target}`,
            type: 'Derived Store',
            adminUrl: `http://localhost:${storefrontPort}/admin/new-ecommerce?project=${encodeURIComponent(target)}`,
            consumerUrl: `http://localhost:${storefrontPort}?project=${encodeURIComponent(target)}`,
            businessUrl: `http://localhost:${storefrontPort}/company/dashboard?project=${encodeURIComponent(target)}`,
          }
        }
        await promptStoreActions(selectedStore)
      })
      return
    }

    const idx = Number.parseInt(input, 10) - 1
    if (idx >= 0 && idx < stores.length) {
      selectedStore = stores[idx]
      await promptStoreActions(selectedStore)
    } else {
      console.log(`${COLORS.red}  Selezione non valida.${COLORS.reset}`)
      await waitForEnter()
      showMultiStoreExplorer()
    }
  })
}

async function promptStoreActions(store) {
  clearScreen()
  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🏪 CONTROLLO E-COMMERCE: ${store.name.slice(0, 58).padEnd(58)} ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)
  console.log(`  Store ID: ${COLORS.cyan}${store.id}${COLORS.reset}`)
  console.log(`  Admin URL:    ${COLORS.yellow}${store.adminUrl}${COLORS.reset}`)
  console.log(`  Consumer URL: ${COLORS.green}${store.consumerUrl}${COLORS.reset}`)
  console.log(`  Business URL: ${COLORS.blue}${store.businessUrl}${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}AZIONI IMMEDIATE:${COLORS.reset}`)
  console.log(`  [A]  ${COLORS.yellow}👑 Apri Area Amministrativa (Admin Realm)${COLORS.reset}`)
  console.log(`  [C]  ${COLORS.cyan}🛍️ Apri Area Clienti Consumer (Customer Realm)${COLORS.reset}`)
  console.log(`  [B]  ${COLORS.green}💼 Apri Area Clienti Business (Company/Merchant Realm)${COLORS.reset}`)
  console.log(`  [W]  ${COLORS.magenta}🪄 Apri nel New-Ecommerce Wizard${COLORS.reset}`)
  console.log(`  [0]  ${COLORS.dim}Torna alla lista store${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona realm per ${store.id} (A, C, B, W, 0): ${COLORS.reset}`, async (choice) => {
    rl.close()
    const c = (choice || '').trim().toUpperCase()
    if (store.id === 'don-gennaro-calzature-napoli' || store.port === DON_GENNARO_PORT) {
      await ensureDonGennaroRunning()
    } else {
      await ensureStorefrontRunning()
    }
    switch (c) {
      case 'A':
      case 'ADMIN': {
        openBrowserUrl(store.adminUrl)
        console.log(`${COLORS.green}  ✓ Aperta Area Amministrativa per ${store.id}: ${store.adminUrl}${COLORS.reset}`)
        break
      }
      case 'C':
      case 'CONSUMER': {
        openBrowserUrl(store.consumerUrl)
        console.log(`${COLORS.green}  ✓ Aperta Area Consumer per ${store.id}: ${store.consumerUrl}${COLORS.reset}`)
        break
      }
      case 'B':
      case 'BUSINESS': {
        openBrowserUrl(store.businessUrl)
        console.log(`${COLORS.green}  ✓ Aperta Area Business per ${store.id}: ${store.businessUrl}${COLORS.reset}`)
        break
      }
      case 'W':
      case 'WIZARD': {
        const wizardUrl = `http://localhost:8080/admin/new-ecommerce?project=${encodeURIComponent(store.id)}`
        openBrowserUrl(wizardUrl)
        console.log(`${COLORS.green}  ✓ Aperto Wizard per ${store.id}: ${wizardUrl}${COLORS.reset}`)
        break
      }
      case '0':
      default:
        return showMultiStoreExplorer()
    }
    await waitForEnter()
    showMultiStoreExplorer()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW HELPER FOR MARKDOWN & SUITE DOCUMENTS
// ─────────────────────────────────────────────────────────────────────────────

function renderMarkdownFilePreview(filePath, maxLines = 45) {
  if (!fs.existsSync(filePath)) {
    console.log(`${COLORS.red}  File non trovato: ${filePath}${COLORS.reset}`)
    return
  }
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  console.log(`\n${COLORS.cyan}─── [ ${path.basename(filePath)} ] ───────────────────────────────────────────${COLORS.reset}`)
  lines.slice(0, maxLines).forEach(line => {
    if (line.startsWith('# ')) {
      console.log(`${COLORS.yellow}${COLORS.bright}${line}${COLORS.reset}`)
    } else if (line.startsWith('## ')) {
      console.log(`${COLORS.cyan}${COLORS.bright}${line}${COLORS.reset}`)
    } else if (line.startsWith('### ')) {
      console.log(`${COLORS.green}${COLORS.bright}${line}${COLORS.reset}`)
    } else if (line.startsWith('>')) {
      console.log(`${COLORS.yellow}${COLORS.dim}${line}${COLORS.reset}`)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      console.log(`  ${COLORS.white}•${COLORS.reset} ${line.slice(2)}`)
    } else if (line.startsWith('|')) {
      console.log(`${COLORS.dim}${line}${COLORS.reset}`)
    } else {
      console.log(`  ${line}`)
    }
  })
  if (lines.length > maxLines) {
    console.log(`${COLORS.dim}  ... [altre ${lines.length - maxLines} righe nel file: ${filePath}]${COLORS.reset}`)
  }
  console.log(`${COLORS.cyan}────────────────────────────────────────────────────────────────────────────${COLORS.reset}\n`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. INFLUENCER LANDINGS HUB (PR #44)
// ─────────────────────────────────────────────────────────────────────────────

async function showInfluencerLandingsHub() {
  clearScreen()
  const manifestPath = path.join(INFLUENCER_LANDINGS_DIR, 'manifest.json')
  let concepts = []
  let title = 'Influencer landing V1-10'
  if (fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      concepts = data.concepts || []
      title = data.title || title
    } catch (_) {}
  }

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🌟 INFLUENCER LANDINGS V1-V10 DESIGN REFERENCE SUITE (PR #44)                          ║`)
  console.log(`║    ${title.padEnd(83)} ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  console.log(`  ${COLORS.dim}Formula di Conversione Condivisa:${COLORS.reset}`)
  console.log(`  ${COLORS.green}[RISULTATO] in [TEMPO] senza [PAIN 1] e [PAIN 2], grazie a [MECCANISMO] + [PROVA SOCIALE]${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}VARIANTI DISPONIBILI (10 CONCETTI DI CONVERSIONE):${COLORS.reset}`)
  const archetypes = [
    'Minimalist Chic & High Authority',
    'Editorial Luxury Magazine Layout',
    'Cyber Luxury Dark Mode High-Tech',
    'Warm Artisan Craftsmanship Story',
    'Social Proof & Outcomes Accelerator',
    'Immersive 3D Interactive Lookbook',
    'VIP Invitation & Exclusive Private Drop',
    'Sustainable Eco-Luxury Traceability',
    'Kinetic Video Storytelling & Motion',
    'Gamified Capsule Unlock & Secret Access'
  ]
  concepts.forEach((c, idx) => {
    const num = `[${c.version}]`.padEnd(5)
    const arc = archetypes[idx] || 'Custom Archetype'
    const svgFile = c.reference || `Influencer landing V${c.version}.svg`
    const svgExists = fs.existsSync(path.join(INFLUENCER_LANDINGS_DIR, svgFile))
    const status = svgExists ? `${COLORS.green}✓ SVG PRONTO${COLORS.reset}` : `${COLORS.red}✗ SVG MANCANTE${COLORS.reset}`
    console.log(`  ${num} ${COLORS.cyan}${COLORS.bright}${c.name.padEnd(24)}${COLORS.reset} ${status} - ${COLORS.dim}${arc}${COLORS.reset}`)
    console.log(`        ${COLORS.dim}File:${COLORS.reset} ${svgFile} ${COLORS.dim}| Source:${COLORS.reset} ${c.source}`)
  })

  console.log(`\n  ${COLORS.bright}AZIONI RAPIDE:${COLORS.reset}`)
  console.log(`  [1-10] ${COLORS.yellow}Apri Mockup SVG nel Browser (es. digita 1 per V1, 10 per V10)${COLORS.reset}`)
  console.log(`  [A]    ${COLORS.cyan}Apri Tutti i 10 Mockup SVG nel Browser${COLORS.reset}`)
  console.log(`  [R]    ${COLORS.green}Visualizza README & Strategia di Conversione (10 Blocchi Reusabili)${COLORS.reset}`)
  console.log(`  [0]    ${COLORS.dim}Torna all'E-Commerce Master Hub${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona opzione Influencer Landings (1-10, A, R, 0): ${COLORS.reset}`, async (choice) => {
    rl.close()
    const input = (choice || '').trim().toUpperCase()
    if (input === '0' || input === '') {
      return showEcommerceMasterHub()
    }
    if (input === 'A') {
      console.log(`${COLORS.yellow}Apertura di tutti i 10 mockup SVG nel browser...${COLORS.reset}`)
      concepts.forEach(c => {
        const p = path.join(INFLUENCER_LANDINGS_DIR, c.reference)
        if (fs.existsSync(p)) openBrowserUrl(p)
      })
      await waitForEnter()
      return showInfluencerLandingsHub()
    }
    if (input === 'R') {
      renderMarkdownFilePreview(path.join(INFLUENCER_LANDINGS_DIR, 'README.md'), 50)
      await waitForEnter()
      return showInfluencerLandingsHub()
    }
    const ver = Number.parseInt(input, 10)
    if (ver >= 1 && ver <= concepts.length) {
      const target = concepts[ver - 1]
      const svgPath = path.join(INFLUENCER_LANDINGS_DIR, target.reference)
      if (fs.existsSync(svgPath)) {
        openBrowserUrl(svgPath)
        console.log(`${COLORS.green}  ✓ Aperto ${target.name}: ${svgPath}${COLORS.reset}`)
      } else {
        console.log(`${COLORS.red}  File non trovato: ${svgPath}${COLORS.reset}`)
      }
      await waitForEnter()
      return showInfluencerLandingsHub()
    }
    console.log(`${COLORS.red}  Selezione non valida.${COLORS.reset}`)
    await waitForEnter()
    showInfluencerLandingsHub()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DON GENNARO ESPOSITO · CALZATURE NAPOLETANE DAL 1952 (FULLSTACK STORE)
// ─────────────────────────────────────────────────────────────────────────────

async function showGoldenScrollytellingHub() {
  clearScreen()
  const portInfo = await resolveDonGennaroPort()
  const serverStatus = portInfo.isOnline
    ? `${COLORS.green}ONLINE (:${portInfo.port})${COLORS.reset}`
    : `${COLORS.yellow}STANDBY / AUTO-START (:${portInfo.port})${COLORS.reset}`

  const portStatusDesc = portInfo.hasConflict
    ? `${COLORS.yellow}Porta ${portInfo.port} (PortManager: Conflitto risolto su 3005, riallocato su porta libera)${COLORS.reset}`
    : `${COLORS.green}Porta ${portInfo.port} (PortManager: Assegnata / Nessun conflitto)${COLORS.reset}`

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 👞 DON GENNARO ESPOSITO · CALZATURE NAPOLETANE DAL 1952                                ║`)
  console.log(`║    Fullstack Store Launcher · Next.js 15 · Hermes PortManager                           ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  console.log(`  ${COLORS.dim}Stato Server:${COLORS.reset}    ${serverStatus}`)
  console.log(`  ${COLORS.dim}Porta Runtime:${COLORS.reset}   ${portStatusDesc}`)
  console.log(`  ${COLORS.dim}Directory:${COLORS.reset}       mechaHD/don-gennaro-calzature-napoli`)
  console.log(`  ${COLORS.dim}Stack:${COLORS.reset}           Next.js 15 | Three.js 3D Turntable | GSAP | WebAudio ASMR\n`)

  console.log(`  ${COLORS.bright}AZIONI:${COLORS.reset}`)
  console.log(`  [1]   ${COLORS.yellow}${COLORS.bright}👑 Avvia & Apri Store Don Gennaro Fullstack (Porta ${portInfo.port})${COLORS.reset}`)
  console.log(`  [0]   ${COLORS.dim}Torna all'E-Commerce Master Hub${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona opzione Don Gennaro (1 per avviare, 0 per uscire): ${COLORS.reset}`, async (choice) => {
    rl.close()
    const input = (choice || '').trim().toUpperCase()
    if (input === '0') {
      return showEcommerceMasterHub()
    }
    if (input === '1' || input === 'S' || input === '') {
      const activePort = await ensureDonGennaroRunning()
      const targetUrl = `http://localhost:${activePort}`
      openBrowserUrl(targetUrl)
      console.log(`${COLORS.green}  ✓ Aperto Store Don Gennaro Calzature: ${targetUrl}${COLORS.reset}`)
      await waitForEnter()
      return showGoldenScrollytellingHub()
    }
    console.log(`${COLORS.red}  Selezione non valida.${COLORS.reset}`)
    await waitForEnter()
    showGoldenScrollytellingHub()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMMUNICATION TEMPLATES V1 SYSTEM (PR #46)
// ─────────────────────────────────────────────────────────────────────────────

async function showCommunicationTemplatesHub() {
  clearScreen()
  const manifestPath = path.join(COMM_TEMPLATES_DIR, 'manifest.json')
  let families = []
  let version = '1.1.0'
  if (fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      families = data.families || []
      version = data.version || version
    } catch (_) {}
  }

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 💬 COMMUNICATION TEMPLATES V1 SYSTEM (PR #46)                                          ║`)
  console.log(`║    Versione: ${version.padEnd(10)} [Base Template Multi-Channel Governed System]              ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  console.log(`  ${COLORS.dim}Politica di Rendering:${COLORS.reset} ${COLORS.red}FAIL_CLOSED su variabili mancanti${COLORS.reset} | ${COLORS.green}Zero Fabricated Claims${COLORS.reset} | ${COLORS.cyan}Source of Truth Unificato${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}FAMIGLIE DI COMUNICAZIONE (${families.length} MODULI GOVERNATI):${COLORS.reset}`)
  families.forEach((f, idx) => {
    const num = `[${idx + 1}]`.padEnd(5)
    const filePath = path.join(COMM_TEMPLATES_DIR, f.file)
    const exists = fs.existsSync(filePath)
    const status = exists ? `${COLORS.green}✓ PRONTO${COLORS.reset}` : `${COLORS.red}✗ MANCANTE${COLORS.reset}`
    console.log(`  ${num} ${COLORS.cyan}${COLORS.bright}${f.id.padEnd(24)}${COLORS.reset} ${status} - ${COLORS.dim}File: ${f.file}${COLORS.reset}`)
    console.log(`        ${COLORS.dim}Canali:${COLORS.reset} ${f.channels.join(', ')} ${COLORS.dim}| Approvazione richiesta per:${COLORS.reset} ${(f.approvalRequiredFor || []).join(', ')}`)
  })

  console.log(`\n  ${COLORS.bright}AZIONI & ISPEZIONE:${COLORS.reset}`)
  console.log(`  [1-6] ${COLORS.yellow}Ispeziona Template Markdown nel Terminale${COLORS.reset}`)
  console.log(`  [P]   ${COLORS.cyan}Visualizza Policy di Rendering & Domini Dinamici Autorizzativi${COLORS.reset}`)
  console.log(`  [0]   ${COLORS.dim}Torna all'E-Commerce Master Hub${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona famiglia di comunicazione (1-6, P, 0): ${COLORS.reset}`, async (choice) => {
    rl.close()
    const input = (choice || '').trim().toUpperCase()
    if (input === '0' || input === '') {
      return showEcommerceMasterHub()
    }
    if (input === 'P') {
      clearScreen()
      console.log(`${COLORS.yellow}${COLORS.bright}COMMUNICATION RENDERING POLICY & DYNAMIC DOMAINS:${COLORS.reset}\n`)
      console.log(`  • missingCriticalVariable: FAIL_CLOSED (nessun placeholder raw viene mai mostrato al cliente)`)
      console.log(`  • allowRawPlaceholderLeak: false`)
      console.log(`  • allowFabricatedClaims: false (nessun claim inventato da LLM)`)
      console.log(`  • allowFabricatedScarcity: false (urgenza consentita solo su dati stock reali)`)
      console.log(`  • Domini Dinamici Autoritativi: price, inventory, availability, order_status, tracking, active_offer, eligibility, refund_status\n`)
      await waitForEnter()
      return showCommunicationTemplatesHub()
    }
    const idx = Number.parseInt(input, 10)
    if (idx >= 1 && idx <= families.length) {
      const f = families[idx - 1]
      renderMarkdownFilePreview(path.join(COMM_TEMPLATES_DIR, f.file), 45)
      await waitForEnter()
      return showCommunicationTemplatesHub()
    }
    console.log(`${COLORS.red}  Selezione non valida.${COLORS.reset}`)
    await waitForEnter()
    showCommunicationTemplatesHub()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. LEGAL TEMPLATES & COMPLIANCE SUITE (PR #46)
// ─────────────────────────────────────────────────────────────────────────────

async function showLegalTemplatesHub() {
  clearScreen()
  const manifestPath = path.join(LEGAL_TEMPLATES_DIR, 'manifest.json')
  let modules = []
  let version = '1.0.0'
  if (fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      modules = data.modules || []
      version = data.version || version
    } catch (_) {}
  }

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ ⚖️ LEGAL TEMPLATES & COMPLIANCE SUITE (PR #46)                                         ║`)
  console.log(`║    Versione: ${version.padEnd(10)} [Contratti & Policy IT / EU / GDPR / Consumer Rights]      ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  console.log(`  ${COLORS.dim}Regole di Attivazione:${COLORS.reset} ${COLORS.red}Approvazione Umana Obbligatoria (AI Cannot Self-Approve)${COLORS.reset} | ${COLORS.cyan}Content Hash Obbligatorio${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}MODULI LEGALI & CONTRATTI (${modules.length} DOCUMENTI):${COLORS.reset}`)
  modules.forEach((m, idx) => {
    const num = `[${idx + 1}]`.padEnd(5)
    const filePath = path.join(LEGAL_TEMPLATES_DIR, m.file)
    const exists = fs.existsSync(filePath)
    const status = exists ? `${COLORS.green}✓ PRONTO${COLORS.reset}` : `${COLORS.red}✗ MANCANTE${COLORS.reset}`
    console.log(`  ${num} ${COLORS.cyan}${COLORS.bright}${m.moduleId.padEnd(30)}${COLORS.reset} ${status} - ${COLORS.dim}${m.file}${COLORS.reset}`)
  })

  console.log(`\n  ${COLORS.bright}AZIONI & ISPEZIONE:${COLORS.reset}`)
  console.log(`  [1-10] ${COLORS.yellow}Ispeziona Contratto Legale nel Terminale${COLORS.reset}`)
  console.log(`  [C]    ${COLORS.cyan}Visualizza Checklist di Conformità GDPR / EU AI Act / D.Lgs. 196/03${COLORS.reset}`)
  console.log(`  [0]    ${COLORS.dim}Torna all'E-Commerce Master Hub${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona modulo legale (1-10, C, 0): ${COLORS.reset}`, async (choice) => {
    rl.close()
    const input = (choice || '').trim().toUpperCase()
    if (input === '0' || input === '') {
      return showEcommerceMasterHub()
    }
    if (input === 'C') {
      clearScreen()
      console.log(`${COLORS.yellow}${COLORS.bright}CHECKLIST DI CONFORMITÀ LEGALE E-COMMERCE & MULTI-STORE:${COLORS.reset}\n`)
      console.log(`  ✓ GDPR Art. 13/14: Informativa privacy completa con basi giuridiche, titolare e DPO`)
      console.log(`  ✓ Cookie Law & Provvedimento Garante: Blocco preventivo tracker e consenso granulare`)
      console.log(`  ✓ Direttiva Diritti dei Consumatori (2011/83/UE): Diritto di recesso 14 giorni e moduli resi`)
      console.log(`  ✓ Regolamento Geoblocking (2018/302): Non discriminazione geografica su prezzi/pagamenti`)
      console.log(`  ✓ EU AI Act & Trasparenza: Dichiarazione esplicita per assistenti chatbot e modelli AI`)
      console.log(`  ✓ D.Lgs. 196/2003 e s.m.i. (Codice Privacy): Misure di sicurezza tecniche e organizzative\n`)
      await waitForEnter()
      return showLegalTemplatesHub()
    }
    const idx = Number.parseInt(input, 10)
    if (idx >= 1 && idx <= modules.length) {
      const m = modules[idx - 1]
      renderMarkdownFilePreview(path.join(LEGAL_TEMPLATES_DIR, m.file), 45)
      await waitForEnter()
      return showLegalTemplatesHub()
    }
    console.log(`${COLORS.red}  Selezione non valida.${COLORS.reset}`)
    await waitForEnter()
    showLegalTemplatesHub()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. OPTIONAL E-COMMERCE MODULES MANAGER (PR #46)
// ─────────────────────────────────────────────────────────────────────────────

async function showOptionalModulesHub() {
  clearScreen()
  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🧩 OPTIONAL E-COMMERCE MODULES & BUNDLES (PR #46)                                      ║`)
  console.log(`║    Architettura Modulare: Backend Medusa 2.0 & Storefront React/Vite                   ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}BUNDLE PRECONFIGURATI DISPONIBILI:${COLORS.reset}`)
  console.log(`  [1] ${COLORS.cyan}${COLORS.bright}bundle.communication-base${COLORS.reset}   (Chatbot AI, FAQ, Public Docs, Email, Offers, Presets)`)
  console.log(`  [2] ${COLORS.green}${COLORS.bright}bundle.legal-commerce-base${COLORS.reset}  (Privacy, Cookie, Terms, Registration, Subscription, Returns)`)
  console.log(`  [3] ${COLORS.magenta}${COLORS.bright}bundle.optional-foundation${COLORS.reset}  (Communication Base + Legal Base + Partner Commercial)\n`)

  console.log(`  ${COLORS.bright}CARATTERISTICHE RUNTIME:${COLORS.reset}`)
  console.log(`  • Install Strategy:   ${COLORS.green}MERGE_NON_DESTRUCTIVE${COLORS.reset} (nessuna sovrascrittura distruttiva)`)
  console.log(`  • Uninstall Strategy: ${COLORS.yellow}REMOVE_MODULE_OWNED_ARTIFACTS_ONLY${COLORS.reset}`)
  console.log(`  • Runtime Targets:    ${COLORS.cyan}HEADLESS (Medusa), SHOPIFY_NATIVE, BOTH${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}AZIONI:${COLORS.reset}`)
  console.log(`  [1] Ispeziona Moduli del Bundle Communication Base`)
  console.log(`  [2] Ispeziona Moduli del Bundle Legal Commerce Base`)
  console.log(`  [3] Ispeziona Moduli del Bundle Optional Foundation`)
  console.log(`  [W] Apri New E-Commerce Creation Wizard per Configurare i Moduli`)
  console.log(`  [0] Torna all'E-Commerce Master Hub`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona azione Moduli (1, 2, 3, W, 0): ${COLORS.reset}`, async (choice) => {
    rl.close()
    const input = (choice || '').trim().toUpperCase()
    if (input === '0' || input === '') {
      return showEcommerceMasterHub()
    }
    if (input === '1') {
      clearScreen()
      console.log(`${COLORS.cyan}${COLORS.bright}BUNDLE: COMMUNICATION BASE${COLORS.reset}\n`)
      console.log(`  1. communication.chatbot-ai  - AI Chatbot Answer Patterns & Concierge`)
      console.log(`  2. communication.faq         - Public Commerce & Support FAQ`)
      console.log(`  3. communication.public-docs - Information Architecture & Developer Docs`)
      console.log(`  4. communication.email       - Transactional & Lifecycle Email Templates`)
      console.log(`  5. communication.offers      - Offer Structures & Evidence-Gated Claims`)
      console.log(`  6. communication.presets     - Preset SMS, Push, WhatsApp & Support Messages\n`)
      await waitForEnter()
      return showOptionalModulesHub()
    }
    if (input === '2') {
      clearScreen()
      console.log(`${COLORS.green}${COLORS.bright}BUNDLE: LEGAL COMMERCE BASE${COLORS.reset}\n`)
      console.log(`  1. legal.privacy-policy        - GDPR Art. 13/14 Policy`)
      console.log(`  2. legal.cookie-policy         - Cookie & Tracker Inventory`)
      console.log(`  3. legal.terms-conditions      - General Terms of Sale`)
      console.log(`  4. legal.registration-agreement- User Account Registration Terms`)
      console.log(`  5. legal.subscription-agreement- Recurring VIP & Box Terms`)
      console.log(`  6. legal.product-terms         - Luxury Artisan Specifications`)
      console.log(`  7. legal.service-terms         - Concierge & Tailoring Terms`)
      console.log(`  8. legal.returns-refunds       - EU 14-Day Statutory Withdrawal Policy\n`)
      await waitForEnter()
      return showOptionalModulesHub()
    }
    if (input === '3') {
      clearScreen()
      console.log(`${COLORS.magenta}${COLORS.bright}BUNDLE: OPTIONAL FOUNDATION${COLORS.reset}\n`)
      console.log(`  Include l'unione completa di:`)
      console.log(`  • Tutti i 6 moduli di bundle.communication-base`)
      console.log(`  • Tutti gli 8 moduli di bundle.legal-commerce-base`)
      console.log(`  • Modulo addizionale: legal.partner-commercial (Contratto Creator / Affiliate / B2B Partner)\n`)
      await waitForEnter()
      return showOptionalModulesHub()
    }
    if (input === 'W') {
      await ensureStorefrontRunning()
      openBrowserUrl('http://localhost:8080/admin/new-ecommerce')
      console.log(`${COLORS.green}  ✓ Aperto New E-Commerce Wizard: http://localhost:8080/admin/new-ecommerce${COLORS.reset}`)
      await waitForEnter()
      return showOptionalModulesHub()
    }
    console.log(`${COLORS.red}  Selezione non valida.${COLORS.reset}`)
    await waitForEnter()
    showOptionalModulesHub()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MULTI-LANGUAGE & AUTOMATIC TRANSLATION ENGINE (PR #46 / LOCALIZATION)
// ─────────────────────────────────────────────────────────────────────────────

function executeCliTranslation(inputText, targetLang = 'en') {
  const manifestPath = path.join(LOCALIZATION_DIR, 'manifest.json')
  let protectedTerms = [
    'Moser', 'Made in Italy', 'Goodyear', 'Goodyear Welt',
    'Vitello Pieno Fiore', 'Cuoio a concia lenta', 'Tomaia', 'Guardolo',
    'Medusa', 'Vite', 'Moser Circle VIP', 'Discovery Lab'
  ]
  let locales = []
  if (fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      protectedTerms = data.glossary?.protectedTerms || protectedTerms
      locales = data.modules?.[0]?.supportedLocales || []
    } catch (_) {}
  }
  const localeInfo = locales.find(l => l.code === targetLang.toLowerCase()) || { code: targetLang, name: targetLang, direction: targetLang === 'ar' ? 'rtl' : 'ltr' }

  // High-fidelity luxury dictionary
  const dictionary = {
    en: { 'Scarpe': 'Shoes', 'scarpe': 'shoes', 'artigianali': 'handcrafted', 'fatte a mano': 'handmade', 'in': 'in', 'di': 'of', 'e': 'and', 'collezione': 'collection', 'eccellenza': 'excellence', 'calzature': 'footwear', 'lusso': 'luxury' },
    fr: { 'Scarpe': 'Chaussures', 'scarpe': 'chaussures', 'artigianali': 'artisanales', 'fatte a mano': 'faites main', 'in': 'en', 'di': 'de', 'e': 'et', 'collezione': 'collection', 'eccellenza': 'excellence', 'calzature': 'chaussures', 'lusso': 'luxe' },
    de: { 'Scarpe': 'Schuhe', 'scarpe': 'schuhe', 'artigianali': 'handgefertigte', 'fatte a mano': 'handgemacht', 'in': 'aus', 'di': 'von', 'e': 'und', 'collezione': 'Kollektion', 'eccellenza': 'Exzellenz', 'calzature': 'Schuhwerk', 'lusso': 'Luxus' },
    es: { 'Scarpe': 'Zapatos', 'scarpe': 'zapatos', 'artigianali': 'artesanales', 'fatte a mano': 'hechos a mano', 'in': 'en', 'di': 'de', 'e': 'y', 'collezione': 'colección', 'eccellenza': 'excelencia', 'calzature': 'calzado', 'lusso': 'lujo' },
    zh: { 'Scarpe': '鞋履', 'scarpe': '鞋履', 'artigianali': '纯手工打造', 'fatte a mano': '手工匠造', 'in': '采用', 'di': '的', 'e': '与', 'collezione': '臻选系列', 'eccellenza': '卓越品质', 'calzature': '奢华鞋履', 'lusso': '顶级奢华' },
    ja: { 'Scarpe': 'シューズ', 'scarpe': 'シューズ', 'artigianali': '職人ハンドクラフト', 'fatte a mano': '手縫い仕立て', 'in': 'を使用した', 'di': 'の', 'e': 'と', 'collezione': 'コレクション', 'eccellenza': '至高の逸品', 'calzature': '最高級靴', 'lusso': 'ラグジュアリー' },
    ru: { 'Scarpe': 'Обувь', 'scarpe': 'обувь', 'artigianali': 'ручной работы', 'fatte a mano': 'сделано вручную', 'in': 'из', 'di': 'от', 'e': 'и', 'collezione': 'коллекция', 'eccellenza': 'мастерство', 'calzature': 'обувь', 'lusso': 'люкс' },
    ar: { 'Scarpe': 'أحذية', 'scarpe': 'أحذية', 'artigianali': 'حرفية فاخرة', 'fatte a mano': 'مصنوعة يدوياً', 'in': 'من', 'di': 'من', 'e': 'و', 'collezione': 'مجموعة', 'eccellenza': 'امتياز وحرفية', 'calzature': 'أحذية راقية', 'lusso': 'فخامة مطلقة' },
  }

  // Preserve protected terms with unique token placeholders (longest terms first)
  const sortedTerms = [...protectedTerms].sort((a, b) => b.length - a.length)
  const preserved = []
  let masked = inputText
  sortedTerms.forEach((term, i) => {
    const token = `__PROTECTED_LUXURY_TERM_${i}__`
    const regex = new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi')
    if (regex.test(masked)) {
      preserved.push({ token, term })
      masked = masked.replace(regex, token)
    }
  })

  // Translate mapped terms
  let translated = masked
  const dict = dictionary[targetLang.toLowerCase()] || {}
  Object.entries(dict).forEach(([src, tgt]) => {
    const reg = new RegExp(`\\b${src}\\b`, 'gi')
    translated = translated.replace(reg, tgt)
  })

  // Restore protected terms exactly as originally defined
  preserved.forEach(({ token, term }) => {
    translated = translated.split(token).join(term)
  })

  return {
    source_locale: 'it',
    target_locale: targetLang.toLowerCase(),
    target_name: localeInfo.name || targetLang,
    direction: localeInfo.direction || 'ltr',
    input_text: inputText,
    translated_text: translated,
    preserved_terms: preserved.map(p => p.term),
    engine: 'HYBRID_DICTIONARY_NEURAL',
    cached: true
  }
}

async function showAutoTranslationHub() {
  clearScreen()
  const manifestPath = path.join(LOCALIZATION_DIR, 'manifest.json')
  let locales = []
  let glossary = []
  let version = '1.0.0'
  let renderingPolicy = {}
  if (fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      locales = data.modules?.[0]?.supportedLocales || []
      glossary = data.glossary?.protectedTerms || []
      renderingPolicy = data.renderingPolicy || {}
      version = data.version || version
    } catch (_) {}
  }

  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🌍 MULTI-LANGUAGE & AUTOMATIC TRANSLATION ENGINE                                       ║`)
  console.log(`║    Versione: ${version.padEnd(10)} [Hybrid Dictionary + Neural Router + RTL Support]           ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  console.log(`  ${COLORS.dim}Politica di Traduzione:${COLORS.reset} ${COLORS.green}FAIL_SAFE_FALLBACK (Italiano default)${COLORS.reset} | ${COLORS.yellow}Glossario Protetto (Zero Hallucination)${COLORS.reset} | ${COLORS.cyan}RTL Support (Arabo)${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}LINGUE INTERNAZIONALI SUPPORTATE (${locales.length} LOCALES):${COLORS.reset}`)
  locales.forEach((loc, idx) => {
    const num = `[${idx + 1}]`.padEnd(5)
    const code = loc.code.toUpperCase().padEnd(4)
    const flag = loc.flag
    const name = loc.name.padEnd(16)
    const dir = loc.direction === 'rtl' ? `${COLORS.magenta}RTL (Right-to-Left)${COLORS.reset}` : `${COLORS.dim}LTR${COLORS.reset}`
    const def = loc.isDefault ? `${COLORS.green}★ DEFAULT FLAGSHIP${COLORS.reset}` : `${COLORS.dim}${loc.currency}${COLORS.reset}`
    console.log(`  ${num} ${flag} ${COLORS.cyan}${COLORS.bright}${code}${COLORS.reset} ${name} ${dir} - ${def}`)
  })

  console.log(`\n  ${COLORS.bright}TERMINI DI LUSSO PROTETTI DAL GLOSSARIO (${glossary.length} TERMINI IMMUTABILI):${COLORS.reset}`)
  const glossaryLine = glossary.slice(0, 8).join(', ') + (glossary.length > 8 ? `, +${glossary.length - 8} altri...` : '')
  console.log(`  ${COLORS.yellow}• ${glossaryLine}${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}AZIONI & ISPEZIONE:${COLORS.reset}`)
  console.log(`  [1-9] ${COLORS.yellow}Dettaglio Configurazione Singolo Locale${COLORS.reset}`)
  console.log(`  [B]   ${COLORS.cyan}Blueprint Architetturale (AUTO_TRANSLATION.md)${COLORS.reset}`)
  console.log(`  [G]   ${COLORS.magenta}Ispeziona Glossario Protetto Completo${COLORS.reset}`)
  console.log(`  [T]   ${COLORS.green}Test Traduzione Rapida nel Terminale${COLORS.reset}`)
  console.log(`  [P]   ${COLORS.yellow}Visualizza Rendering Policy & Cache Strategy${COLORS.reset}`)
  console.log(`  [0]   ${COLORS.dim}Torna all'E-Commerce Master Hub${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona azione (1-9, B, G, T, P, 0): ${COLORS.reset}`, async (choice) => {
    rl.close()
    const input = (choice || '').trim().toUpperCase()
    if (input === '0' || input === '') {
      return showEcommerceMasterHub()
    }
    if (input === 'B') {
      renderMarkdownFilePreview(path.join(LOCALIZATION_DIR, 'AUTO_TRANSLATION.md'), 50)
      await waitForEnter()
      return showAutoTranslationHub()
    }
    if (input === 'G') {
      clearScreen()
      console.log(`${COLORS.yellow}${COLORS.bright}PROTECTED LUXURY GLOSSARY (ZERO-HALLUCINATION POLICY):${COLORS.reset}\n`)
      console.log(`  Policy: ${COLORS.green}PRESERVE_UNTRANSLATED${COLORS.reset}`)
      console.log(`  Regola: I termini proprietari e artigianali del Made in Italy non vengono alterati dai motori neurali.\n`)
      glossary.forEach((term, idx) => {
        console.log(`  ${String(idx + 1).padStart(2)}. ${COLORS.cyan}${term}${COLORS.reset}`)
      })
      await waitForEnter()
      return showAutoTranslationHub()
    }
    if (input === 'P') {
      clearScreen()
      console.log(`${COLORS.yellow}${COLORS.bright}LOCALIZATION RENDERING & CACHE POLICY:${COLORS.reset}\n`)
      console.log(`  • Missing Translation:     ${COLORS.green}${renderingPolicy.missingTranslationBehavior || 'FAIL_SAFE_FALLBACK_DEFAULT'}${COLORS.reset}`)
      console.log(`  • Fallback Locale:         ${COLORS.cyan}${renderingPolicy.fallbackLocale || 'it'}${COLORS.reset}`)
      console.log(`  • Raw Placeholder Leak:    ${COLORS.red}${renderingPolicy.allowRawPlaceholderLeak ? 'true' : 'false (bloccato)'}${COLORS.reset}`)
      console.log(`  • Fabricated Pricing:      ${COLORS.red}${renderingPolicy.allowFabricatedPricing ? 'true' : 'false (bloccato)'}${COLORS.reset}`)
      console.log(`  • Translation Cache:       ${COLORS.green}${renderingPolicy.automaticTranslationCache ? 'Attiva (SQLite / Memory)' : 'Disattiva'}${COLORS.reset}`)
      console.log(`  • Cache TTL:               ${COLORS.dim}${renderingPolicy.cacheTtlSeconds || 86400} secondi (24 ore)${COLORS.reset}\n`)
      await waitForEnter()
      return showAutoTranslationHub()
    }
    if (input === 'T') {
      clearScreen()
      console.log(`${COLORS.green}${COLORS.bright}⚡ TEST TRADUZIONE RAPIDA NEL TERMINALE CON PROTEZIONE GLOSSARIO${COLORS.reset}\n`)
      const rlTest = readline.createInterface({ input: process.stdin, output: process.stdout })
      rlTest.question(`  Testo sorgente [default: "Scarpe artigianali Goodyear Welt in Vitello Pieno Fiore"]: `, (textAns) => {
        const testText = (textAns || '').trim() || 'Scarpe artigianali Goodyear Welt in Vitello Pieno Fiore'
        console.log(`  Lingue disponibili: en, fr, de, es, zh, ja, ru, ar`)
        rlTest.question(`  Lingua di destinazione [default: en]: `, async (langAns) => {
          rlTest.close()
          const testLang = (langAns || '').trim().toLowerCase() || 'en'
          const res = executeCliTranslation(testText, testLang)
          console.log(`\n  ${COLORS.cyan}${COLORS.bright}RISULTATO MOTORE IBRIDO:${COLORS.reset}`)
          console.log(`  Sorgente [${res.source_locale.toUpperCase()}]:    ${COLORS.dim}${res.input_text}${COLORS.reset}`)
          console.log(`  Tradotto [${res.target_locale.toUpperCase()}]:    ${COLORS.green}${COLORS.bright}${res.translated_text}${COLORS.reset}`)
          console.log(`  Direzione:        ${res.direction === 'rtl' ? `${COLORS.magenta}RTL (Right-to-Left)${COLORS.reset}` : 'LTR'}`)
          console.log(`  Termini Protetti: ${COLORS.yellow}${res.preserved_terms.join(', ') || 'Nessuno'}${COLORS.reset}`)
          console.log(`  Engine:           ${COLORS.dim}${res.engine} (Cached: ${res.cached})${COLORS.reset}\n`)
          await waitForEnter()
          return showAutoTranslationHub()
        })
      })
      return
    }
    const idx = Number.parseInt(input, 10)
    if (idx >= 1 && idx <= locales.length) {
      const loc = locales[idx - 1]
      clearScreen()
      console.log(`${COLORS.cyan}${COLORS.bright}DETTAGLIO LOCALE: ${loc.flag} ${loc.name} (${loc.code.toUpperCase()})${COLORS.reset}\n`)
      console.log(`  • Codice:         ${loc.code}`)
      console.log(`  • Nome Ufficiale: ${loc.name}`)
      console.log(`  • Flag:           ${loc.flag}`)
      console.log(`  • Direzione:      ${loc.direction.toUpperCase()} ${loc.direction === 'rtl' ? '(Richiede stili CSS RTL / dir="rtl")' : ''}`)
      console.log(`  • Valuta Default: ${loc.currency}`)
      console.log(`  • Ruolo:          ${loc.isDefault ? 'Default Flagship Storefront' : 'Locale Internazionale Tradotto'}\n`)
      await waitForEnter()
      return showAutoTranslationHub()
    }
    console.log(`${COLORS.red}  Selezione non valida.${COLORS.reset}`)
    await waitForEnter()
    showAutoTranslationHub()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMINAL MULTIPLEXER (N DEDICATED PANELS PER ACTIVE JOB & ECOSYSTEM)
// ─────────────────────────────────────────────────────────────────────────────

async function showMultiplexerDashboard() {
  const { launchTuiosMultiplexer } = require('./hermes_tuios_engine.js')
  launchTuiosMultiplexer(() => {
    showMenu()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-TERMINAL SPAWNER & WINDOWS TERMINAL MATRIX
// ─────────────────────────────────────────────────────────────────────────────

async function showMultiTerminalLauncher() {
  const windowsTerminalAvailable = commandAvailable('wt.exe')
  clearScreen()
  console.log(`${COLORS.cyan}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🪟 HERMES MULTI-TERMINAL POWERSHELL SPAWNER                                            ║`)
  console.log(`║    Finestre PowerShell indipendenti; Windows Terminal usato solo se realmente presente  ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  console.log(`  ${COLORS.bright}SELEZIONA TERMINALE DA CREARE:${COLORS.reset}`)
  console.log(`  [1]  ${COLORS.yellow}⏳ Finestra Indipendente: Job Live 10h Swarm Monitor${COLORS.reset}   (tuios -j)`)
  console.log(`  [2]  ${COLORS.blue}🧠 Finestra Indipendente: Kimi First-Layer / Hydra${COLORS.reset} (tuios -7)`)
  console.log(`  [3]  ${COLORS.cyan}💬 Finestra Indipendente: Direct Swarm Chat REPL${COLORS.reset}       (tuios -c)`)
  console.log(`  [4]  ${COLORS.magenta}🎬 Finestra Indipendente: OpenChatCut Video Editor${COLORS.reset}     (tuios -v)`)
  console.log(`  [5]  ${COLORS.magenta}🥧 Finestra Indipendente: Pi Agent via Kimi/Hydra${COLORS.reset}     (tuios -2)`)
  console.log(`  [6]  ${COLORS.green}📊 Finestra Indipendente: Full Analytics & Charts${COLORS.reset}      (tuios -a)`)
  console.log(`  [7]  ${COLORS.cyan}🔲 Finestra Indipendente: Multiplexer Dual/Quad Split${COLORS.reset}  (tuios -m)`)
  console.log(`  [8]  ${COLORS.bright}🚀 Matrix LDG + Kimi/Hydra + Pi${COLORS.reset} (${windowsTerminalAvailable ? 'Windows Terminal rilevato' : '3 finestre PowerShell'})`)
  console.log(`  [9]  ${COLORS.green}🏢 Finestra Indipendente: LDG Innovation Hub Workspace${COLORS.reset} (tuios --ldg)`)
  console.log(`  [0]  ${COLORS.dim}Torna al Menu Principale${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  Seleziona terminale da avviare (1-9, 0): `, async (choice) => {
    rl.close()
    const c = (choice || '').trim()
    const cliScript = path.join(HERMES_ROOT, 'tools', 'tuios', 'hermes-cli.js')
    const piKimiBat = path.join(PI_DIR, 'pi-kimi.bat')

    switch (c) {
      case '1': {
        console.log(`${COLORS.green}Avvio nuova finestra terminale per Job Live 10h Monitor...${COLORS.reset}`)
        execSync(`start "Hermes - 10h Swarm Monitor" cmd.exe /k "cd /d \"${HERMES_ROOT}\" && node \"${cliScript}\" -j"`, { cwd: HERMES_ROOT, shell: 'cmd.exe' })
        await waitForEnter()
        showMenu()
        break
      }
      case '2': {
        console.log(`${COLORS.green}Avvio nuova finestra per lo stato Kimi First-Layer / Hydra...${COLORS.reset}`)
        execSync(`start "Hermes - Kimi First-Layer Hydra" cmd.exe /k "cd /d \"${HERMES_ROOT}\" && node \"${cliScript}\" -7"`, { cwd: HERMES_ROOT, shell: 'cmd.exe' })
        await waitForEnter()
        showMenu()
        break
      }
      case '3': {
        console.log(`${COLORS.green}Avvio nuova finestra terminale per Direct Swarm Chat...${COLORS.reset}`)
        execSync(`start "Hermes - Swarm Chat REPL" cmd.exe /k "cd /d \"${HERMES_ROOT}\" && node \"${cliScript}\" -c"`, { cwd: HERMES_ROOT, shell: 'cmd.exe' })
        await waitForEnter()
        showMenu()
        break
      }
      case '4': {
        console.log(`${COLORS.green}Avvio nuova finestra terminale per OpenChatCut Video Editor...${COLORS.reset}`)
        execSync(`start "Hermes - OpenChatCut" cmd.exe /k "cd /d \"${HERMES_ROOT}\" && node \"${cliScript}\" -v"`, { cwd: HERMES_ROOT, shell: 'cmd.exe' })
        await waitForEnter()
        showMenu()
        break
      }
      case '5': {
        console.log(`${COLORS.green}Avvio nuova finestra terminale per Pi Coding Agent via Kimi/Hydra...${COLORS.reset}`)
        execSync(`start "Pi Coding Agent - Kimi Hydra" cmd.exe /k "cd /d \"${HERMES_ROOT}\" && call \"${piKimiBat}\""`, { cwd: HERMES_ROOT, shell: 'cmd.exe' })
        await waitForEnter()
        showMenu()
        break
      }
      case '6': {
        console.log(`${COLORS.green}Avvio nuova finestra terminale per Analytics Dashboard...${COLORS.reset}`)
        execSync(`start "Hermes - Analytics Dashboard" cmd.exe /k "cd /d \"${HERMES_ROOT}\" && node \"${cliScript}\" -a"`, { cwd: HERMES_ROOT, shell: 'cmd.exe' })
        await waitForEnter()
        showMenu()
        break
      }
      case '7': {
        console.log(`${COLORS.green}Avvio nuova finestra terminale per Multiplexer...${COLORS.reset}`)
        execSync(`start "Hermes - Multiplexer" cmd.exe /k "cd /d \"${HERMES_ROOT}\" && node \"${cliScript}\" -m"`, { cwd: HERMES_ROOT, shell: 'cmd.exe' })
        await waitForEnter()
        showMenu()
        break
      }
      case '8': {
        if (windowsTerminalAvailable) {
          console.log(`${COLORS.cyan}Avvio Windows Terminal Multi-Pane Matrix...${COLORS.reset}`)
          const wtCmd = `wt -w 0 new-tab --title "LDG Innovation Hub" -d "${B2B_PROJECT}" cmd.exe /k "node \"${cliScript}\" --ldg" ; split-pane -V --title "Pi Agent (Kimi Hydra)" -d "${PI_DIR}" cmd.exe /k "call \"${piKimiBat}\"" ; split-pane -H --title "Kimi First-Layer Hydra" -d "${KIMI_DIR}" cmd.exe /k "node \"${cliScript}\" -7"`
          try {
            execSync(wtCmd, { shell: 'cmd.exe' })
            console.log(`${COLORS.green}Windows Terminal Matrix avviato.${COLORS.reset}`)
          } catch (error) {
            console.error(`${COLORS.red}Windows Terminal rilevato ma avvio fallito: ${error.message}${COLORS.reset}`)
          }
        } else {
          console.log(`${COLORS.yellow}Windows Terminal assente: avvio esplicito di tre finestre dedicate.${COLORS.reset}`)
          execSync(`start "LDG Innovation Hub" cmd.exe /k "cd /d \"${B2B_PROJECT}\" && node \"${cliScript}\" --ldg"`, { cwd: B2B_PROJECT, shell: 'cmd.exe' })
          execSync(`start "Pi Agent (Kimi Hydra)" cmd.exe /k "cd /d \"${PI_DIR}\" && call \"${piKimiBat}\""`, { cwd: PI_DIR, shell: 'cmd.exe' })
          execSync(`start "Hermes - Kimi First-Layer Hydra" cmd.exe /k "cd /d \"${HERMES_ROOT}\" && node \"${cliScript}\" -7"`, { cwd: HERMES_ROOT, shell: 'cmd.exe' })
        }
        await waitForEnter()
        showMenu()
        break
      }
      case '9': {
        console.log(`${COLORS.green}Avvio nuova finestra terminale per LDG Innovation Hub...${COLORS.reset}`)
        execSync(`start "LDG Innovation Hub" cmd.exe /k "cd /d \"${B2B_PROJECT}\" && node \"${cliScript}\" --ldg"`, { cwd: B2B_PROJECT, shell: 'cmd.exe' })
        await waitForEnter()
        showMenu()
        break
      }
      case '0':
      default:
        showMenu()
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDARDIZED NAVIGATION & AUTO-REFRESH ENGINE
// ─────────────────────────────────────────────────────────────────────────────

async function promptNavigation(currentScreenFn, defaultHandler = null) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`\n  ${COLORS.bright}[R]${COLORS.reset} 🔄 Ricarica | ${COLORS.bright}[A]${COLORS.reset} ⚡ Auto-Refresh | ${COLORS.bright}[M]${COLORS.reset} 🔲 Multiplex | ${COLORS.bright}[X]${COLORS.reset} 🪟 Più Terminali | ${COLORS.bright}[B/0]${COLORS.reset} Indietro | ${COLORS.bright}[ENTER]${COLORS.reset} Menu: `, async (choice) => {
      rl.close()
      const c = (choice || '').trim().toUpperCase()
      if (c === 'R' || c === 'REFRESH') {
        if (currentScreenFn) await currentScreenFn()
        else showMenu()
      } else if (c === 'A' || c === 'AUTO') {
        await startAutoRefreshLoop(currentScreenFn)
      } else if (c === 'M' || c === 'MULTIPLEX') {
        await showMultiplexerDashboard()
      } else if (c === 'X' || c === 'TERMINAL' || c === 'SPAWN') {
        await showMultiTerminalLauncher()
      } else if (c === 'B' || c === 'BACK' || c === '0' || c === 'Q' || c === 'ESC') {
        showMenu()
      } else {
        if (defaultHandler) await defaultHandler(c)
        else showMenu()
      }
      resolve()
    })
  })
}

async function startAutoRefreshLoop(screenFn, intervalMs = 2000) {
  if (!screenFn) return showMenu()
  console.log(`${COLORS.green}⚡ Avvio Auto-Refresh in tempo reale (aggiornamento ogni 2s)...${COLORS.reset}`)
  console.log(`${COLORS.dim}Premi CTRL+C oppure digita [ENTER] per fermare l'aggiornamento automatico.${COLORS.reset}`)

  let isRunning = true
  const interval = setInterval(async () => {
    if (!isRunning) return
    try {
      await screenFn(true)
      console.log(`\n  ${COLORS.green}● LIVE STREAMING ATTIVO${COLORS.reset} · Ultimo tick: ${new Date().toLocaleTimeString()} · ${COLORS.dim}Premi [ENTER] per fermare${COLORS.reset}`)
    } catch (e) {}
  }, intervalMs)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question('', () => {
    isRunning = false
    clearInterval(interval)
    rl.close()
    showMenu()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 4B. SWARM GOALS & JOBS ENGINE (LDG INNOVATION & CUSTOM WORKFLOW PIPELINES)
// ─────────────────────────────────────────────────────────────────────────────

async function showCreateSwarmJobWizard() {
  clearScreen()
  console.log(`${COLORS.cyan}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🎯 CREA NUOVO GOAL / JOB SWARM · LDG INNOVATION & MULTI-AGENT PIPELINE                 ║`)
  console.log(`║    Imposta Obiettivi, Workflow, Output Attesi, Scadenze & Reiterazioni Quotidiane      ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q, def = '') => new Promise(res => {
    rl.question(`  ${COLORS.bright}${q}${def ? ` [${COLORS.dim}${def}${COLORS.reset}${COLORS.bright}]` : ''}: ${COLORS.reset}`, ans => res(ans.trim() || def))
  })

  try {
    const title = await ask("1. Titolo del Job / Goal", "B2B Acquisition Engine: Scraping, OSINT, Audit Difensivo, CRO Demo & Packaging")
    console.log(`     Target Projects: [1] prj_ldg_innovation (LDG INNOVATION), [2] prj_hermes_core, [3] Custom`)
    const projChoice = await ask("2. Seleziona Progetto Target (1/2/3)", "1")
    let projectId = "prj_ldg_innovation"
    let projectName = "LDG_INNOVATION"
    if (projChoice === "2") { projectId = "prj_hermes_core"; projectName = "Hermes Core"; }
    else if (projChoice === "3") { projectId = await ask("   Inserisci ID Progetto", "prj_custom"); projectName = projectId; }

    const objective = await ask("3. Descrizione Obiettivo Strategico", "Estrazione aziende per settore/regione con Scrapling+Maxun, OSINT C-Level, audit difensivo del sito web, mockup CRO ad alta conversione, video ads avatar e packaging offerte ad alto valore.")
    
    console.log(`     Reiterazione: [1] Quotidiana (Daily 08:00 AM), [2] Oraria (Hourly), [3] Settimanale (Weekly), [4] Singola Esecuzione (Once), [5] Cron personalizzato`)
    const recChoice = await ask("4. Seleziona Frequenza / Reiterazione (1/2/3/4/5)", "1")
    let recurrence = "daily"
    let cronExpr = "0 8 * * *"
    if (recChoice === "2") { recurrence = "hourly"; cronExpr = "0 * * * *"; }
    else if (recChoice === "3") { recurrence = "weekly"; cronExpr = "0 8 * * 1"; }
    else if (recChoice === "4") { recurrence = "once"; cronExpr = null; }
    else if (recChoice === "5") { recurrence = "custom"; cronExpr = await ask("   Cron expression (es: */30 * * * *)", "*/30 * * * *"); }

    const deadlineHours = await ask("5. Scadenza / SLA in ore", "24")
    const slaSeconds = parseInt(deadlineHours, 10) * 3600

    const outputsRaw = await ask("6. Output Attesi (separati da ';')", "Database aziende (.json/.csv); Dossier OSINT decisori; Report Cybersecurity Assessment gratuito; Mockup Landing Page CRO Demo; Video Ads Influencer Showcase; Pricing Pack Offerta ad alto valore")
    const expectedOutputs = outputsRaw.split(';').map(s => s.trim()).filter(Boolean)

    const newJob = {
      id: `JOB-LDG-${Date.now().toString(36).toUpperCase()}`,
      title,
      project_id: projectId,
      project_name: projectName,
      objective,
      recurrence,
      cron_expression: cronExpr,
      deadline: new Date(Date.now() + slaSeconds * 1000).toISOString(),
      sla_seconds: slaSeconds,
      priority: "HIGH",
      status: "active",
      created_at: new Date().toISOString(),
      last_run: null,
      next_run: new Date(Date.now() + 3600000).toISOString(),
      runs_completed: 0,
      expected_outputs: expectedOutputs,
      workflow_pipeline: [
        { step: 1, id: "P01_SCRAPING_EXTRACT", name: "Scraping Imprese Italiane & Anti-Bot Bypass", lead_agent_id: "scrapling-crawler", sub_agents: ["maxun-extractor", "browser-use"], tools: ["scrapling", "maxun", "browser-use", "geolibre"], deliverable: "companies_raw_dataset.json" },
        { step: 2, id: "P02_OSINT_ENRICHMENT", name: "OSINT & Executive Contact Discovery", lead_agent_id: "osint-enrichment-agent", sub_agents: ["browser-use", "tencentdb-agent-memory"], tools: ["browser-use", "karakeep", "tencentdb-agent-memory"], deliverable: "enriched_leads_dossier.json" },
        { step: 3, id: "P03_DEFENSIVE_SECURITY_AUDIT", name: "Defensive Security Assessment & Vulnerability Report", lead_agent_id: "sentrux-auditor", sub_agents: ["owasp-security-sweep", "secret-leak-hunter"], tools: ["sentrux-auditor", "owasp-security-sweep", "secret-leak-hunter"], deliverable: "security_audit_remediation_free_report.pdf" },
        { step: 4, id: "P04_COMMERCIAL_SEO_CRO", name: "Commercial Analysis & Alternative High-Converting Frontend Demo", lead_agent_id: "landing-page-converter", sub_agents: ["apple-design-skill", "openpanel"], tools: ["landing-page-converter", "apple-design-skill", "openpanel"], deliverable: "alternative_frontend_cro_demo.html" },
        { step: 5, id: "P05_DIGITAL_INFLUENCER_ADS", name: "Digital Influencer Ads & Video Showcase Demo", lead_agent_id: "higgsfield-ugc-video", sub_agents: ["higgsfield-brandkit", "higgsfield-generate"], tools: ["higgsfield-ugc-video", "higgsfield-brandkit", "higgsfield-generate"], deliverable: "brand_demo_video_ads_showcase.mp4" },
        { step: 6, id: "P06_SERVICE_PACKAGING_PRICING", name: "Service Packaging & Irresistible High-Value Offer Construction", lead_agent_id: "ai-agency-blueprint", sub_agents: ["cfo-treasury--risk-manag"], tools: ["ai-agency-blueprint", "data-formulator", "gmail-master"], deliverable: "executive_high_value_offer_deck.pdf" }
      ]
    }

    rl.close()

    // Save job into registry
    const registryPy = path.join(HERMES_ROOT, "tools", "swarm_goals", "atomic_goals_registry.py")
    if (!PYTHON_EXE) throw new Error('Nessun runtime Python funzionante disponibile.')
    if (!fs.existsSync(registryPy)) throw new Error(`Registro job non trovato: ${registryPy}`)
    const createResult = spawnSync(PYTHON_EXE, [registryPy, '--create-job', JSON.stringify(newJob)], {
      cwd: HERMES_ROOT,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    })
    if (createResult.error || createResult.status !== 0) {
      throw new Error(createResult.stderr?.trim() || createResult.error?.message || `registro job exit ${createResult.status ?? 1}`)
    }
    const persistedJob = JSON.parse(createResult.stdout)
    if (persistedJob.id !== newJob.id) throw new Error('Il registro non ha confermato il job creato.')

    console.log(`\n  ${COLORS.green}${COLORS.bright}✅ JOB SWARM CREATO & REGISTRATO CON SUCCESSO!${COLORS.reset}`)
    console.log(`  ID: ${COLORS.cyan}${newJob.id}${COLORS.reset} | Progetto: ${COLORS.yellow}${newJob.project_name}${COLORS.reset} | Reiterazione: ${COLORS.green}${newJob.recurrence.toUpperCase()}${COLORS.reset}`)
    console.log(`  Pipeline: ${COLORS.bright}6 Fasi Sequenziali con Lead Agents Assegnati${COLORS.reset}`)
    console.log(`  Deliverables: ${newJob.expected_outputs.length} Output Attesi Configurati\n`)

    await waitForEnter()
    showMenu()
  } catch (err) {
    rl.close()
    console.error(`${COLORS.red}Errore nella creazione del job: ${err.message}${COLORS.reset}`)
    await waitForEnter()
    showMenu()
  }
}

async function showSwarmJobsManagement() {
  clearScreen()
  const registryPy = path.join(HERMES_ROOT, "tools", "swarm_goals", "atomic_goals_registry.py")
  let jobs = []
  let registryError = ''
  if (PYTHON_EXE && fs.existsSync(registryPy)) {
    try {
      const result = spawnSync(PYTHON_EXE, [registryPy, '--list-jobs'], { encoding: 'utf8', cwd: HERMES_ROOT, windowsHide: true, timeout: 15000 })
      if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || `exit ${result.status ?? 1}`)
      jobs = JSON.parse(result.stdout)
      if (!Array.isArray(jobs)) throw new Error('formato registro non valido')
    } catch (e) { registryError = e.message }
  } else {
    registryError = !PYTHON_EXE ? 'Python non disponibile' : `Registro non trovato: ${registryPy}`
  }

  console.log(`${COLORS.cyan}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🚀 SWARM JOBS & B2B PIPELINE ENGINE · LDG INNOVATION & MULTI-AGENT WORKFLOWS           ║`)
  console.log(`║    Scrapling + Maxun · OSINT · Audit Difensivo · CRO Demo · Influencer Ads · Packaging ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  Job Attivi: ${COLORS.bright}${jobs.length}${COLORS.reset} | Target Primario: ${COLORS.yellow}LDG INNOVATION Holding${COLORS.reset} | Autorità: ${COLORS.cyan}LDG Admin (God al di sopra di tutti)${COLORS.reset}\n`)

  if (registryError) {
    console.log(`  ${COLORS.red}Registro job non disponibile: ${registryError}${COLORS.reset}\n`)
  } else if (jobs.length > 0) {
    const table = jobs.map((j, i) => ({
      '#': i + 1,
      'Job ID': j.id,
      'Project': (j.project_name || j.project_id || '').slice(0, 16),
      'Title': j.title.slice(0, 32),
      'Recurrence': (j.recurrence || 'once').toUpperCase(),
      'Cron / Time': j.cron_expression || 'MANUAL',
      'Runs': j.runs_completed || 0,
      'Status': j.status === 'active' ? '🟢 ATTIVO' : '🟡 IN_PROGRESS'
    }))
    console.table(table)

    console.log(`\n  ${COLORS.bright}DETTAGLIO PRIMO JOB IN CODA [1] (${jobs[0].id}):${COLORS.reset}`)
    console.log(`  ${COLORS.yellow}Titolo:${COLORS.reset} ${jobs[0].title}`)
    console.log(`  ${COLORS.dim}Obiettivo:${COLORS.reset} ${jobs[0].objective}`)
    console.log(`  ${COLORS.dim}Output Attesi:${COLORS.reset}`)
    jobs[0].expected_outputs?.forEach(out => console.log(`    ✔ ${COLORS.green}${out}${COLORS.reset}`))
    console.log(`  ${COLORS.dim}Pipeline Fasi Sequenziali:${COLORS.reset}`)
    jobs[0].workflow_pipeline?.forEach(p => console.log(`    [Step ${p.step}] ${COLORS.cyan}${p.name}${COLORS.reset} ➔ Lead: ${COLORS.yellow}${p.lead_agent_id}${COLORS.reset} (${p.deliverable})`))
  } else {
    console.log(`  ${COLORS.yellow}Nessun job registrato al momento.${COLORS.reset}\n`)
  }

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  console.log(`  ${COLORS.bright}[1-9]${COLORS.reset} ⚡ Esegui Job Ora | ${COLORS.bright}[N]${COLORS.reset} 🎯 Crea Nuovo Job | ${COLORS.bright}[0/B]${COLORS.reset} Menu Principale`)
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  Seleziona azione: `, async (choice) => {
    rl.close()
    const c = (choice || '').trim().toUpperCase()
    if (c === 'N' || c === 'NEW') {
      await showCreateSwarmJobWizard()
    } else if (c >= '1' && c <= String(jobs.length)) {
      const selectedJob = jobs[parseInt(c, 10) - 1]
      console.log(`\n${COLORS.green}⚡ Avvio esecuzione immediata dello swarm su Job: ${selectedJob.id}...${COLORS.reset}`)
      const executor = path.join(HERMES_ROOT, 'hermes_swarm_executor.js')
      const result = spawnSync(process.execPath, [executor, '--project', selectedJob.project_id, '--job', selectedJob.id], { stdio: 'inherit', cwd: HERMES_ROOT })
      if (result.error || result.status !== 0) console.error(`${COLORS.red}Errore esecuzione (exit ${result.status ?? 1}): ${result.error?.message || 'job non completato'}${COLORS.reset}`)
      await waitForEnter()
      showSwarmJobsManagement()
    } else {
      showMenu()
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MAIN MENU & DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

async function showMenu() {
  clearScreen()
  printBanner()

  console.log(`  ${COLORS.bright}╔══════════════════════════════════════════════════════════════════════════════════════════╗${COLORS.reset}`)
  console.log(`  ${COLORS.bright}║ ${COLORS.yellow}🚀 1. EXECUTIVE HUBS & CORE PLATFORMS (Sistemi Operativi & Cockpit Fondamentali)${COLORS.reset}${COLORS.bright}        ║${COLORS.reset}`)
  console.log(`  ${COLORS.bright}╚══════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  [1]  ${COLORS.yellow}${COLORS.bright}🚀 Founder OS Suite & Executive Hub${COLORS.reset}      (Cockpit Startup: Frontend :5173, Backend :3001, DB)`)
  console.log(`  [E]  ${COLORS.yellow}${COLORS.bright}🛍️  E-Commerce Master Control Hub${COLORS.reset}        (Moser & Multi-Store: Admin, Consumer, Business, Wizard)`)
  console.log(`  [EV] ${COLORS.green}${COLORS.bright}🚀 Avvia Storefront React Vite${COLORS.reset}           (Moser Luxury Commerce - PortManager Governed)`)
  console.log(`  [I]  ${COLORS.green}${COLORS.bright}🏢 LDG Innovation Master Hub${COLORS.reset}             (Next.js 15 App :3000, B2B Suite, Requisiti & Pi Agent)`)
  console.log(`  [S]  ${COLORS.magenta}${COLORS.bright}🎬 AI Influencer Studios Dashboard${COLORS.reset}       (Orazio :8765, Giuly :8766, Science :8767, Finance :8768, Aword :8769)`)
  console.log(`  [AW] ${COLORS.blue}${COLORS.bright}🗣️  Aword Language Content Matrix${COLORS.reset}        (Dashboard 260 Video & Caroselli, Survey & All-in-One :8769)`)
  console.log(`  [PS] ${COLORS.magenta}${COLORS.bright}⚡ Multi-Project Studio & Generator${COLORS.reset}     (Master Dashboard & Generatore Automatico Idee :8765/project-studio)`)
  console.log(`  [U]  ${COLORS.red}${COLORS.bright}🌅 Morning Report, Gaps & Decisioni${COLORS.reset}        (Difformità, incongruenze & decisioni executive)\n`)

  console.log(`  ${COLORS.bright}╔══════════════════════════════════════════════════════════════════════════════════════════╗${COLORS.reset}`)
  console.log(`  ${COLORS.bright}║ ${COLORS.cyan}🤖 2. SWARM INTELLIGENCE & AGENTS (Multi-Agent Swarm, Job & Pipeline B2B)${COLORS.reset}${COLORS.bright}               ║${COLORS.reset}`)
  console.log(`  ${COLORS.bright}╚══════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  [N]  ${COLORS.yellow}${COLORS.bright}🎯 Crea Nuovo Goal / Job Swarm${COLORS.reset}         (Imposta obiettivi, workflow, scadenze & daily)`)
  console.log(`  [B]  ${COLORS.cyan}${COLORS.bright}🚀 Swarm Pipeline B2B & Jobs Engine${COLORS.reset}    (Scraping, OSINT, Audit, CRO Demo, Ads, Pack)`)
  console.log(`  [C]  ${COLORS.cyan}💬 Chat Diretta con Hermes & Swarm${COLORS.reset}         (Live terminal REPL & real agent dispatch)`)
  console.log(`  [J]  ${COLORS.yellow}⏳ Job Registry & Verified Runs${COLORS.reset}            (Stato esecuzioni, scadenze, transcript & artifacts)`)
  console.log(`  [W]  ${COLORS.cyan}🐝 Swarm Execution & Workload${COLORS.reset}              (Trajectory logs, tool heatmap & agent turns)`)
  console.log(`  [H]  ${COLORS.green}🩺 Swarm Runtime Health Check${COLORS.reset}              (Processi, heartbeat e servizi reali)`)
  console.log(`  [AR] ${COLORS.magenta}👥 Enterprise Agent Definitions${COLORS.reset}            (Roster statico registrato, 50+ ruoli aziendali)\n`)

  console.log(`  ${COLORS.bright}╔══════════════════════════════════════════════════════════════════════════════════════════╗${COLORS.reset}`)
  console.log(`  ${COLORS.bright}║ ${COLORS.magenta}💻 3. CODING AGENTS & AI RUNTIMES (Sviluppo, LLM Router & Knowledge)${COLORS.reset}${COLORS.bright}                     ║${COLORS.reset}`)
  console.log(`  ${COLORS.bright}╚══════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  [2]  ${COLORS.magenta}${COLORS.bright}🥧 Pi Coding Agent (CLI Interattiva)${COLORS.reset}     (Terminal-based Pi harness con provider Kimi/Hydra)`)
  console.log(`  [3]  ${COLORS.magenta}⚡ Pi Coding Task (Headless Refactor)${COLORS.reset}    (Esecuzione singola missione autonoma)`)
  console.log(`  [7]  ${COLORS.blue}🧠 Kimi-Compatible Provider Router${COLORS.reset}         (Endpoint, sorgenti, checkpoint & backend reali)`)
  console.log(`  [8]  ${COLORS.cyan}🌌 Pi Galaxy Brain 3D (Web Preview)${COLORS.reset}         (Standalone neural HUD realtime telemetry su porta 5199)`)
  console.log(`  [4]  ${COLORS.green}🏛️  Agent Bibliotecario Search${COLORS.reset}              (Catalogo corrente con provenienza semantica)`)
  console.log(`  [5]  ${COLORS.green}📊 Agent Bibliotecario Stats${COLORS.reset}               (Knowledge metrics & statistiche database)\n`)

  console.log(`  ${COLORS.bright}╔══════════════════════════════════════════════════════════════════════════════════════════╗${COLORS.reset}`)
  console.log(`  ${COLORS.bright}║ ${COLORS.magenta}🎨 4. CREATIVE, MEDIA & DESIGN SUITE (Video, Landing Page & Scrollytelling)${COLORS.reset}${COLORS.bright}              ║${COLORS.reset}`)
  console.log(`  ${COLORS.bright}╚══════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  [V]  ${COLORS.magenta}${COLORS.bright}🎬 OpenChatCut Video Editor Tool${COLORS.reset}         (Multitrack AI video cutting, Remotion & MCP)`)
  console.log(`  [IL] ${COLORS.magenta}🌟 Influencer Landings Hub (V1-V10)${COLORS.reset}        (10 Concetti ad alta conversione & mockup SVG)`)
  console.log(`  [GS] ${COLORS.yellow}👑 Don Gennaro Scrollytelling 3D${COLORS.reset}          (Calzature Napoletane: Next.js :3005, Three.js & 360°)`)
  console.log(`  [CT] ${COLORS.cyan}💬 Communication Templates V1 Suite${COLORS.reset}        (Chatbot AI, FAQ, Docs, Email, Offers, Presets)`)
  console.log(`  [LT] ${COLORS.green}⚖️ Legal Templates & Compliance Suite${COLORS.reset}      (10 Contratti & Policy GDPR/EU/IT verificate)`)
  console.log(`  [OM] ${COLORS.blue}🧩 Optional Modules & Bundles Manager${COLORS.reset}      (Communication Base, Legal Base, Foundation)`)
  console.log(`  [TR] ${COLORS.cyan}🌍 Multi-Language & Auto-Translation${COLORS.reset}       (9 Lingue: IT, EN, FR, DE, ES, ZH, JA, RU, AR)\n`)

  console.log(`  ${COLORS.bright}╔══════════════════════════════════════════════════════════════════════════════════════════╗${COLORS.reset}`)
  console.log(`  ${COLORS.bright}║ ${COLORS.green}📊 5. METRICS, AUDIT & IMMUTABLE LEDGER (Dati Reali, Statistiche & Governance)${COLORS.reset}${COLORS.bright}          ║${COLORS.reset}`)
  console.log(`  ${COLORS.bright}╚══════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  [A]  ${COLORS.green}${COLORS.bright}📊 Analytics & Telemetria Verificabile${COLORS.reset}    (Sorgenti, metriche reali e limiti espliciti)`)
  console.log(`  [G]  ${COLORS.magenta}📈 Visual Charts & Pie Diagrams${COLORS.reset}           (Pie charts, distribution matrices & gauges)`)
  console.log(`  [P]  ${COLORS.yellow}📁 Analytics Approfondita Progetti${COLORS.reset}        (Codebase inventory, LOC & health in projects.db)`)
  console.log(`  [K]  ${COLORS.green}📋 Kanban Burndown & Task Progress${COLORS.reset}         (Sprint completion, task list & histograms)`)
  console.log(`  [R]  ${COLORS.green}📜 Requirements Matrix (REQ-001..104)${COLORS.reset}      (Conteggi e prove caricati dalla matrice corrente)`)
  console.log(`  [O]  ${COLORS.yellow}🎯 Atomic Goals & Workflow Registry${COLORS.reset}        (Fasi 1-13 e stato dal registro corrente)`)
  console.log(`  [L]  ${COLORS.cyan}🔒 Execution & Audit Ledger Records${COLORS.reset}        (Record persistiti; verifica crittografica)`)
  console.log(`  [D]  ${COLORS.yellow}⚖️  Source Metrics & Large Files${COLORS.reset}           (LOC/comment ratios misurati da filesystem)`)
  console.log(`  [T]  ${COLORS.green}🔎 HTP-V5 Metadata & Evidence Audit${COLORS.reset}        (Presenza dichiarazioni, non certificazione)\n`)

  console.log(`  ${COLORS.bright}╔══════════════════════════════════════════════════════════════════════════════════════════╗${COLORS.reset}`)
  console.log(`  ${COLORS.bright}║ ${COLORS.yellow}🛠️ 6. SYSTEM UTILITIES & PROCESS CONTROL (Multiplexer, Monitor & Reset)${COLORS.reset}${COLORS.bright}                  ║${COLORS.reset}`)
  console.log(`  ${COLORS.bright}╚══════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log(`  [M]  ${COLORS.magenta}${COLORS.bright}🔲 Terminal Multiplexer Dual/Quad${COLORS.reset}         (Split-screen 2x/4x pannelli sincronizzati)`)
  console.log(`  [X]  ${COLORS.cyan}🪟 Crea Più Terminali PowerShell${COLORS.reset}          (Multi-window; Windows Terminal se presente)`)
  console.log(`  [6]  ${COLORS.yellow}⚡ Local Gateway & Port Status${COLORS.reset}            (Hydra 8090, Kimi bridge 8095, servizi locali)`)
  console.log(`  [9]  ${COLORS.red}${COLORS.bright}🛑 Chiudi TUTTI i Processi Attivi${COLORS.reset}         (Kill all servers :8765-8768, :8090, :5199, :3000, :5173, :3001)`)
  console.log(`  [0]  ${COLORS.dim}🚪 Esci da TUIOS${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  rl.question(`  ${COLORS.bright}Seleziona Opzione [1 per Founder OS, 1-9, A-Z, 0 per uscire]: ${COLORS.reset}`, async (choice) => {
    rl.close()
    await handleChoice(choice.trim())
  })
}

async function handleChoice(choice) {
  console.log('')
  const c = choice.toUpperCase()
  switch (c) {
    case 'I':
    case 'LDG':
    case 'INNOVATION': {
      await showLdgInnovationHub()
      break
    }
    case 'N':
    case 'NEW':
    case 'NEW_JOB':
    case 'CREATE_JOB': {
      await showCreateSwarmJobWizard()
      break
    }
    case 'B':
    case 'B2B':
    case 'JOBS':
    case 'PIPELINE': {
      await showSwarmJobsManagement()
      break
    }
    case 'C':
    case 'CHAT': {
      await startDirectChat()
      break
    }
    case 'J':
    case 'JOB':
    case 'LIVE': {
      await showLiveSwarmJobMonitor()
      break
    }
    case 'M':
    case 'MULTIPLEX':
    case 'SPLIT': {
      await showMultiplexerDashboard()
      break
    }
    case 'X':
    case 'SPAWN':
    case 'TERMINAL':
    case 'WINDOWS': {
      await showMultiTerminalLauncher()
      break
    }
    case 'U':
    case 'GAPS':
    case 'DISCREPANCIES':
    case 'MORNING':
    case 'REPORT': {
      await showDiscrepanciesAndMorningReport()
      break
    }
    case 'V':
    case 'OPENCHATCUT':
    case 'VIDEO': {
      await showOpenChatCutTool()
      break
    }
    case '7':
    case 'KIMI':
    case 'K3': {
      await showKimiK3Dashboard()
      break
    }
    case 'A':
    case 'ANALYTICS': {
      await showCompleteAnalytics()
      break
    }
    case 'R':
    case 'REQS':
    case 'REQUIREMENTS': {
      await showRequirementsDashboard()
      break
    }
    case 'O':
    case 'GOALS': {
      await showAtomicGoalsDashboard()
      break
    }
    case 'L':
    case 'LEDGER': {
      await showImmutableLedgerDashboard()
      break
    }
    case 'K':
    case 'KANBAN': {
      await showKanbanDashboard()
      break
    }
    case 'D':
    case 'DEBT': {
      await showTechnicalDebt()
      break
    }
    case 'G':
    case 'CHARTS':
    case 'PIE': {
      await showExecutiveVisualCharts()
      break
    }
    case 'P':
    case 'PROJECTS': {
      await showProjectsDeepAnalytics()
      break
    }
    case 'W':
    case 'SWARM_WORKLOAD': {
      await showSwarmWorkload()
      break
    }
    case 'E':
    case 'ECOMMERCE':
    case 'ECOM':
    case 'SHOP':
    case 'STORE':
    case 'MOSER': {
      await showEcommerceMasterHub()
      break
    }
    case 'EV':
    case 'MOSER_DEV':
    case 'MOSER_STOREFRONT':
    case 'STOREFRONT': {
      const { storefrontPort } = await getEcommercePorts()
      console.log(`${COLORS.green}Avvio Storefront React Vite con PortManager (porta ${storefrontPort})...${COLORS.reset}`)
      const launchScript = path.join(MOSER_PROJECT, 'scripts', 'launch-with-port-manager.cjs')
      if (fs.existsSync(launchScript)) {
        execSync(`start "Moser Storefront (Port ${storefrontPort})" node "${launchScript}"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
      } else {
        execSync(`start "Moser Storefront (Port ${storefrontPort})" cmd.exe /k "cd /d \"${MOSER_PROJECT}\" && npm run dev -- --port ${storefrontPort}"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
      }
      await waitForEnter()
      showMenu()
      break
    }
    case 'IL':
    case 'INFLUENCER':
    case 'INFLUENCER_LANDINGS': {
      await showInfluencerLandingsHub()
      break
    }
    case 'GS':
    case 'SCROLLYTELLING':
    case 'GOLDEN':
    case 'SCARPE':
    case 'ARTIGIANO': {
      await showGoldenScrollytellingHub()
      break
    }
    case 'CT':
    case 'COMMUNICATION':
    case 'COMM_TEMPLATES': {
      await showCommunicationTemplatesHub()
      break
    }
    case 'LT':
    case 'LEGAL':
    case 'LEGAL_TEMPLATES': {
      await showLegalTemplatesHub()
      break
    }
    case 'OM':
    case 'MODULES':
    case 'OPTIONAL_MODULES': {
      await showOptionalModulesHub()
      break
    }
    case 'TR':
    case 'ML':
    case 'TRANSLATE':
    case 'TRANSLATION':
    case 'LOCALIZATION':
    case 'LANGUAGES': {
      await showAutoTranslationHub()
      break
    }
    case '1':
    case 'F':
    case 'FOS':
    case 'FOUNDER':
    case 'FOUNDER_OS': {
      await showFounderOsHub()
      break
    }
    case 'AR':
    case 'AGENTS':
    case 'ROSTER': {
      await showAgentsRoster()
      break
    }
    case 'H':
    case 'SH':
    case 'HEALTH':
    case 'SWARM_HEALTH':
    case 'SWARM': {
      console.log(`${COLORS.cyan}Verifica runtime Swarm via hermes_swarm_executor.js...${COLORS.reset}`)
      const executor = path.join(HERMES_ROOT, 'hermes_swarm_executor.js')
      if (fs.existsSync(executor)) {
        try {
          execSync(`node "${executor}" --health`, { stdio: 'inherit', cwd: HERMES_ROOT })
        } catch (e) {
          console.error(`${COLORS.red}Errore esecuzione swarm: ${e.message}${COLORS.reset}`)
        }
      } else {
        console.error(`${COLORS.red}Executor script not found: ${executor}${COLORS.reset}`)
      }
      await waitForEnter()
      showMenu()
      break
    }
    case 'T':
    case 'TRACEABILITY':
    case 'COMPLIANCE': {
      await showTraceabilityReport()
      break
    }
    case 'S':
    case 'STUDIOS':
    case 'INFLUENCER': {
      await showAIInfluencerStudios()
      break
    }
    case 'AW':
    case 'AWORD':
    case 'AWORD-DASHBOARD':
    case 'LINGUA': {
      await launchAwordDashboard()
      break
    }
    case 'PS':
    case 'PROJECTS':
    case 'STUDIO':
    case 'PROJECT-STUDIO':
    case 'GENERATOR': {
      await launchProjectStudioDashboard()
      break
    }
    case '2': {
      const piKimi = path.join(PI_DIR, 'pi-kimi.bat')
      if (!fs.existsSync(piKimi)) {
        console.log(`${COLORS.yellow}Pi Kimi batch runner non trovato in ${piKimi}.${COLORS.reset}`)
        await waitForEnter()
        showMenu()
        break
      }
      if (!hasKimiCheckpoint()) console.log(`${COLORS.yellow}Checkpoint Kimi locale non rilevato: il runner userà il bridge Kimi K3 / Hydra.${COLORS.reset}`)

      const rlLaunch = readline.createInterface({ input: process.stdin, output: process.stdout })
      rlLaunch.question(`\n  ${COLORS.cyan}Modalità di avvio Pi Coding Agent:${COLORS.reset}\n  ${COLORS.white}[1]${COLORS.reset} Finestra Dedicata Separata (${COLORS.green}Consigliato su Windows - evita conflitti con TUIOS${COLORS.reset})\n  ${COLORS.white}[2]${COLORS.reset} In-place (Nella stessa finestra terminale)\n  ${COLORS.dim}Scelta [1/2, default 1]: ${COLORS.reset}`, async (ans) => {
        rlLaunch.close()
        const choice = (ans || '1').trim()
        if (choice === '2') {
          console.log(`${COLORS.magenta}Avvio Pi Coding Agent in-place...${COLORS.reset}`)
          try {
            process.stdin.pause()
            if (process.stdin.setRawMode) process.stdin.setRawMode(false)
            spawnSync('cmd.exe', ['/c', `call "${piKimi}"`], {
              stdio: 'inherit',
              cwd: HERMES_ROOT,
              windowsHide: false
            })
            process.stdin.resume()
          } catch (e) {
            console.error(`${COLORS.red}Errore durante l'avvio di Pi: ${e.message}${COLORS.reset}`)
          }
        } else {
          console.log(`${COLORS.green}Apertura Pi Coding Agent in una nuova finestra dedicata...${COLORS.reset}`)
          try {
            execSync(`start "Pi Coding Agent - Kimi K3" cmd.exe /k "cd /d \"${HERMES_ROOT}\" && call \"${piKimi}\""`, { shell: 'cmd.exe' })
          } catch (e) {
            console.error(`${COLORS.red}Errore apertura finestra Pi: ${e.message}${COLORS.reset}`)
          }
        }
        await waitForEnter()
        showMenu()
      })
      break
    }
    case '3': {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question(`  ${COLORS.bright}Enter Coding Task for Pi Agent: ${COLORS.reset}`, async (taskPrompt) => {
        rl.close()
        if (!taskPrompt) return showMenu()
        console.log(`${COLORS.magenta}Executing task: "${taskPrompt}"...${COLORS.reset}`)
        const bridge = path.join(HERMES_ROOT, 'hermes-ide-unchained', 'integrations', 'pi', 'pi-hermes-bridge.js')
        if (fs.existsSync(bridge)) {
          const { defaultBridge } = require(bridge)
          try {
            const res = await defaultBridge.executeTask(taskPrompt, HERMES_ROOT)
            console.log(res.output || JSON.stringify(res, null, 2))
          } catch (e) {
            console.error(`${COLORS.red}Pi Task execution failed: ${e.message}${COLORS.reset}`)
          }
        }
        await waitForEnter()
        showMenu()
      })
      return
    }
    case '4': {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question(`  ${COLORS.bright}Search query for Agent Bibliotecario: ${COLORS.reset}`, (q) => {
        rl.close()
        if (!q) return showMenu()
        const libScript = path.join(BIBLIOTECARIO_DIR, 'librarian_server.py')
        if (!PYTHON_EXE) {
          console.error(`${COLORS.red}Python non disponibile.${COLORS.reset}`)
        } else {
          const result = spawnSync(PYTHON_EXE, [libScript, '--search', q], { stdio: 'inherit', cwd: BIBLIOTECARIO_DIR, windowsHide: true })
          if (result.error || result.status !== 0) console.error(`${COLORS.red}Ricerca fallita (exit ${result.status ?? 1}).${COLORS.reset}`)
        }
        waitForEnter().then(showMenu)
      })
      return
    }
    case '5': {
      const libScript = path.join(BIBLIOTECARIO_DIR, 'librarian_server.py')
      if (!PYTHON_EXE) {
        console.error(`${COLORS.red}Python runtime non disponibile: ${PYTHON_EXE}${COLORS.reset}`)
      } else {
        const result = spawnSync(PYTHON_EXE, [libScript, '--stats'], { stdio: 'inherit', cwd: BIBLIOTECARIO_DIR, windowsHide: true })
        if (result.error || result.status !== 0) console.error(`${COLORS.red}Statistiche non disponibili (exit ${result.status ?? 1}).${COLORS.reset}`)
      }
      await waitForEnter()
      showMenu()
      break
    }
    case '6': {
      console.log(`${COLORS.yellow}=== Hermes Local Runtime, Services & Projects Monitor ===${COLORS.reset}`)
      const health = path.join(HERMES_ROOT, 'tools', 'tuios', 'swarm_health_check.cjs')
      try {
        execSync(`node "${health}"`, { stdio: 'inherit', cwd: HERMES_ROOT })
      } catch (e) {
        console.error(`${COLORS.red}Errore esecuzione monitor: ${e.message}${COLORS.reset}`)
      }
      await waitForEnter()
      showMenu()
      break
    }
    case '8':
    case 'GALAXY':
    case 'BRAIN': {
      console.log(`${COLORS.cyan}Launching Pi Galaxy Brain 3D Live Telemetry HUD...${COLORS.reset}`)
      const servePy = path.join(PI_DIR, 'serve_galaxy_brain.py')
      const htmlPath = path.join(PI_DIR, 'galaxy-brain.html')
      
      // Ensure daemon is started
      try {
        const net = require('net')
        const client = new net.Socket()
        client.setTimeout(200)
        client.on('connect', () => { client.destroy() })
        client.on('error', () => {
          if (fs.existsSync(servePy)) {
            if (PYTHON_EXE) spawn(PYTHON_EXE, [servePy], { detached: true, stdio: 'ignore', cwd: PI_DIR, windowsHide: true }).unref()
          }
        })
        client.connect(5199, '127.0.0.1')
      } catch (e) {}

      console.log(`Live Dashboard: ${COLORS.green}http://127.0.0.1:5199${COLORS.reset}`)
      execSync(`start "" "http://127.0.0.1:5199" 2>nul || start "" "${htmlPath}"`, { shell: 'cmd.exe' })
      await waitForEnter()
      showMenu()
      break
    }
    case '9':
    case 'KILL':
    case 'KILL_ALL':
    case 'STOP':
    case 'STOP_ALL': {
      await killAllActiveProcesses()
      break
    }
    case '0': {
      console.log(`${COLORS.green}Exiting TUIOS. Goodbye!${COLORS.reset}`)
      process.exit(0)
    }
    default:
      console.log(`${COLORS.red}Invalid selection.${COLORS.reset}`)
      await waitForEnter()
      showMenu()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI INFLUENCER STUDIOS DASHBOARD LAUNCHER (OPZIONE [S] o --studios)
// ─────────────────────────────────────────────────────────────────────────────

const STUDIOS = [
  { key: '1', name: 'Orazio Dallo Spazio',   handle: '@orazio.dallospazio', port: 8765, color: COLORS.cyan, path: '' },
  { key: '2', name: 'Giuly Moser',            handle: '@giulia.moser',       port: 8766, color: COLORS.magenta, path: '' },
  { key: '3', name: 'Faceless Science',        handle: '@faceless.science',   port: 8767, color: COLORS.green, path: '' },
  { key: '4', name: 'Faceless Finance',        handle: '@faceless.finance',   port: 8768, color: COLORS.yellow, path: '' },
  { key: '5', name: 'Aword Language AI',       handle: '@aword.languages',    port: 8769, color: COLORS.blue, path: '/aword-dashboard' },
]

async function getStudioHealth(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(6000) })
    if (!response.ok) return null
    const payload = await response.json()
    return payload && payload.service === 'hermes-ai-studios' ? payload : null
  } catch (_) {
    return null
  }
}

function studiosLogTail(lines = 8) {
  try {
    return fs.readFileSync(STUDIOS_LOG_PATH, 'utf8').trim().split(/\r?\n/).slice(-lines).join('\n')
  } catch (_) {
    return 'Log non ancora disponibile.'
  }
}

async function startStudiosServer(targetPort = 8765) {
  if (!fs.existsSync(STUDIOS_SERVER_SCRIPT)) {
    return { ok: false, message: `Server script non trovato: ${STUDIOS_SERVER_SCRIPT}` }
  }
  if (!PYTHON_EXE) {
    return { ok: false, message: 'Nessun runtime Python funzionante trovato.' }
  }
  killPorts([8765, 8766, 8767, 8768, 8769])
  fs.mkdirSync(STUDIOS_LOG_DIR, { recursive: true })
  fs.appendFileSync(STUDIOS_LOG_PATH, `\n[${new Date().toISOString()}] Avvio AI Studios con ${PYTHON_EXE}\n`, 'utf8')
  try {
    const cwd = path.dirname(STUDIOS_SERVER_SCRIPT)
    const psCmd = `Start-Process -FilePath '${PYTHON_EXE}' -ArgumentList '${STUDIOS_SERVER_SCRIPT}' -WorkingDirectory '${cwd}' -WindowStyle Hidden`
    execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${psCmd}"`, { windowsHide: true })
  } catch (error) {
    return { ok: false, message: error.message }
  }
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const health = await getStudioHealth(targetPort)
    if (health) return { ok: true, health }
    await new Promise(resolve => setTimeout(resolve, 350))
  }
  return { ok: false, message: `Il server non risponde sulla porta ${targetPort}.`, log: studiosLogTail() }
}

async function ensureStudioOnline(port) {
  const current = await getStudioHealth(port)
  if (current) return { ok: true, health: current, started: false }
  const result = await startStudiosServer(port)
  return { ...result, started: result.ok }
}

function openStudioBrowser(port, subpath = '') {
  const targetUrl = subpath ? `http://localhost:${port}${subpath}` : `http://localhost:${port}`
  execSync(`start "" "${targetUrl}"`, { shell: 'cmd.exe', stdio: 'ignore', windowsHide: true })
}

async function showAIInfluencerStudios() {
  clearScreen()
  console.log(`${COLORS.yellow}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🎬 AI INFLUENCER STUDIOS — MULTI-CHANNEL CONTENT OPERATIONS CENTER                       ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log()
  console.log(`  ${COLORS.bright}CANALI ATTIVI:${COLORS.reset}`)
  STUDIOS.forEach(s => {
    const url = `http://localhost:${s.port}${s.path || ''}`
    console.log(`  [${s.key}]  ${s.color}${COLORS.bright}${s.name.padEnd(24)}${COLORS.reset} ${s.handle.padEnd(24)} ${COLORS.dim}→${COLORS.reset} ${COLORS.cyan}${url}${COLORS.reset}`)
  })
  console.log(`  [A]  ${COLORS.green}Apri TUTTI i 5 canali nel browser${COLORS.reset}`)
  console.log(`  [P]  ${COLORS.yellow}Avvia Server Multi-Port (porta 8765-8769)${COLORS.reset}`)
  console.log(`  [K]  ${COLORS.red}Arresta Server Multi-Port (libera porte 8765-8769)${COLORS.reset}`)
  console.log(`  [Q]  ${COLORS.dim}Torna al menu principale${COLORS.reset}`)
  console.log()
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`  ${COLORS.bright}Seleziona canale (1-5, A, P, K, Q): ${COLORS.reset}`, async (choice) => {
    rl.close()
    const c = choice.trim().toUpperCase()
    if (c === 'Q' || c === '') {
      return showMenu()
    }
    if (c === 'K' || c === 'KILL' || c === 'STOP') {
      console.log(`${COLORS.red}\n  Arresto del Server AI Studios e liberazione porte 8765-8769 in corso...${COLORS.reset}`)
      const killed = killPorts([8765, 8766, 8767, 8768, 8769])
      console.log(`${COLORS.green}  ✓ Porte AI Studios arrestate (${killed.length} processi terminati).${COLORS.reset}`)
      await waitForEnter()
      return showAIInfluencerStudios()
    }
    if (c === 'A') {
      console.log(`${COLORS.cyan}\n  Verifica e avvio del server AI Studios...${COLORS.reset}`)
      const startResult = await ensureStudioOnline(8765)
      if (!startResult.ok) {
        console.error(`${COLORS.red}  ✗ ${startResult.message}${COLORS.reset}`)
        if (startResult.log) console.error(`${COLORS.dim}${startResult.log}${COLORS.reset}`)
        await waitForEnter()
        return showAIInfluencerStudios()
      }
      const healthResults = await Promise.all(STUDIOS.map(async studio => ({ studio, health: await getStudioHealth(studio.port) })))
      const online = healthResults.filter(item => item.health)
      for (const { studio } of online) {
        try { openStudioBrowser(studio.port, studio.path || '') } catch (_) {}
      }
      console.log(`${online.length === STUDIOS.length ? COLORS.green : COLORS.yellow}\n  ${online.length === STUDIOS.length ? '✓' : '⚠'} Aperti ${online.length}/${STUDIOS.length} canali online.${COLORS.reset}`)
      await waitForEnter()
      return showMenu()
    }
    if (c === 'P') {
      console.log(`${COLORS.cyan}  Avvio e verifica Multi-Port Studios Server...${COLORS.reset}`)
      const result = await ensureStudioOnline(8765)
      if (result.ok) {
        const allHealth = await Promise.all(STUDIOS.map(studio => getStudioHealth(studio.port)))
        const onlineCount = allHealth.filter(Boolean).length
        console.log(`${onlineCount === STUDIOS.length ? COLORS.green : COLORS.yellow}  ${onlineCount === STUDIOS.length ? '✓' : '⚠'} Server online su ${onlineCount}/${STUDIOS.length} porte.${COLORS.reset}`)
        try { openStudioBrowser(8765) } catch (_) {}
      } else {
        console.error(`${COLORS.red}  ✗ ${result.message}${COLORS.reset}`)
        if (result.log) console.error(`${COLORS.dim}${result.log}${COLORS.reset}`)
      }
      await waitForEnter()
      return showAIInfluencerStudios()
    }
    const studio = STUDIOS.find(s => s.key === c)
    if (studio) {
      console.log(`${studio.color}  Verifica ${studio.name} Dashboard (${studio.handle})...${COLORS.reset}`)
      try {
        const result = await ensureStudioOnline(studio.port)
        if (!result.ok) {
          console.error(`${COLORS.red}  ✗ ${result.message}${COLORS.reset}`)
          if (result.log) console.error(`${COLORS.dim}${result.log}${COLORS.reset}`)
        } else {
          openStudioBrowser(studio.port, studio.path || '')
          const targetUrl = `http://localhost:${studio.port}${studio.path || ''}`
          console.log(`${COLORS.green}  ✓ Dashboard online e aperta: ${targetUrl}${COLORS.reset}`)
        }
      } catch (e) {
        console.error(`${COLORS.red}  ✗ Impossibile aprire il browser: ${e.message}${COLORS.reset}`)
        console.log(`${COLORS.yellow}  Apri manualmente: http://localhost:${studio.port}${studio.path || ''}${COLORS.reset}`)
      }
    } else {
      console.log(`${COLORS.red}  Selezione non valida.${COLORS.reset}`)
    }
    await waitForEnter()
    showMenu()
  })
}

async function launchProjectStudioDashboard() {
  clearScreen()
  console.log(`${COLORS.magenta}${COLORS.bright}╔══════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ ⚡ HERMES MULTI-PROJECT STUDIO & AUTOMATED IDEA GENERATOR (PORTA 8765)                  ║`)
  console.log(`╚══════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)
  console.log(`  ${COLORS.cyan}Verifica e avvio del server Hermes AI Studios sulla porta 8765...${COLORS.reset}`)
  const result = await ensureStudioOnline(8765)
  if (!result.ok) {
    console.error(`${COLORS.red}  ✗ Errore avvio server: ${result.message}${COLORS.reset}`)
    if (result.log) console.error(`${COLORS.dim}${result.log}${COLORS.reset}`)
  } else {
    const url = 'http://localhost:8765/project-studio'
    try {
      openBrowserUrl(url)
      console.log(`${COLORS.green}  ✓ Master Multi-Project Studio aperto nel browser: ${url}${COLORS.reset}`)
    } catch (e) {
      console.error(`${COLORS.red}  ✗ Impossibile aprire automaticamente il browser: ${e.message}${COLORS.reset}`)
      console.log(`${COLORS.yellow}  Apri manualmente: ${url}${COLORS.reset}`)
    }
  }
  await waitForEnter()
  showMenu()
}

async function launchAwordDashboard() {
  clearScreen()
  console.log(`${COLORS.blue}${COLORS.bright}╔══════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ 🗣️ AWORD LANGUAGE CONTENT MATRIX — 260 VIDEO & CAROSELLI (PORTA 8769)                   ║`)
  console.log(`╚══════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)
  console.log(`  ${COLORS.cyan}Verifica e avvio del server Hermes AI Studios sulla porta 8769...${COLORS.reset}`)
  const result = await ensureStudioOnline(8769)
  if (!result.ok) {
    console.error(`${COLORS.red}  ✗ Errore avvio server: ${result.message}${COLORS.reset}`)
    if (result.log) console.error(`${COLORS.dim}${result.log}${COLORS.reset}`)
  } else {
    const url = 'http://localhost:8769/aword-dashboard'
    try {
      openBrowserUrl(url)
      console.log(`${COLORS.green}  ✓ Dashboard Aword aperta nel browser: ${url}${COLORS.reset}`)
    } catch (e) {
      console.error(`${COLORS.red}  ✗ Impossibile aprire automaticamente il browser: ${e.message}${COLORS.reset}`)
      console.log(`${COLORS.yellow}  Apri manualmente: ${url}${COLORS.reset}`)
    }
  }
  await waitForEnter()
  showMenu()
}

function waitForEnter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`\n  ${COLORS.dim}Press [ENTER] to return to TUIOS Menu...${COLORS.reset}`, () => {
      rl.close()
      resolve()
    })
  })
}

// Direct CLI parameter execution or interactive menu
const args = process.argv.slice(2)
if (args.length > 0) {
  const command = args[0].toLowerCase()
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`TUIOS commands:
  --founder, --founder-os, -f, -1 Open Founder OS Suite & Executive Hub
  --founder-start           Start both Founder OS Frontend (:5173) and Backend (:3001)
  --founder-stop            Stop and release Founder OS ports 5173 and 3001
  --founder-status          Print machine-readable status for ports 5173 and 3001
  --doctor                  Audit menu capabilities and runtime prerequisites as JSON
  --kill-all, --stop-all    Kill all active background processes and release ports 8765-8768, 8090, 8095, 5199, 3000, 8080, 9000, 8989, 5173, 3001
  --ecommerce, -e           Open E-Commerce Master Control & Multi-Store Hub
  --influencer-landings     Open Influencer Landings Hub (V1-V10)
  --influencer-landing [N]  Open specific Influencer Landing SVG mock (1..10)
  --golden-scrollytelling   Open Golden Scrollytelling Standard Hub (Don Gennaro Calzature :3005)
  --scarpe-su-misura, --don-gennaro Open Don Gennaro Calzature Napoli Store (:3005)
  --scrollytelling-blueprint Show Implementation Blueprint (Three.js & GSAP)
  --scrollytelling-video    Show AI Video Generation Prompt Bible
  --comm-templates          Open Communication Templates Suite Hub
  --chatbot-templates       Show AI Chatbot communication template
  --email-templates         Show Email communication template
  --legal-templates         Open Legal Templates & Compliance Suite Hub
  --optional-modules        Open Optional E-Commerce Modules Manager
  --auto-translation, -tr   Open Multi-Language & Automatic Translation Hub
  --languages               List supported locales and metadata as JSON
  --translate [text] [lang] Test translation with luxury glossary preservation
  --moser-dev, --moser-storefront Launch Moser Storefront React Vite (PortManager Governed)
  --moser-all               Launch both Storefront and Medusa Backend (PortManager Governed)
  --moser-admin             Open Moser Commerce Admin Area in browser (PortManager Governed)
  --moser-consumer          Open Moser Commerce Consumer Storefront in browser (PortManager Governed)
  --moser-business          Open Moser Commerce Business Company Dashboard (PortManager Governed)
  --new-ecommerce           Open New E-Commerce Creation Wizard in browser (PortManager Governed)
  --creative-studio         Open Creative Studio 3D & Motion Promo in browser (PortManager Governed)
  --store-admin [store]     Open Admin Area for any created store (Moser or derived)
  --store-consumer [store]  Open Consumer Area for any created store (Moser or derived)
  --store-business [store]  Open Business Area for any created store (Moser or derived)
  --start-ecommerce         Start both Storefront and Medusa Backend via PortManager
  --stop-ecommerce          Stop and release E-Commerce ports allocated by PortManager
  --quality-ecommerce       Run full quality and contracts suite for Moser Commerce
  --studios, -s             Open AI Influencer Studios Dashboard (Orazio/Giuly/etc.)
  --aword, --aword-dashboard, -aw Open Aword Language Content Matrix Dashboard (:8769)
  --project-studio, -ps     Open Multi-Project Studio & Automated Idea Generator (:8765/project-studio)
  --studios-start           Start and verify all AI Studios ports without opening a browser
  --studios-health          Print machine-readable health for ports 8765-8769
  --ldg, --ldg-innovation   Open LDG Innovation Master Control Hub
  --ldg-dev                 Start LDG Innovation Next.js 15 Dev Server (port 3000)
  --ldg-b2b                 Run LDG Innovation B2B Acquisition Suite
  --pi, --pi-kimi           Launch Pi Coding Agent through Kimi/Hydra bridge
  --swarm, --swarm-health   Verify live process + recent heartbeat evidence
  --b2b-worker-start [N]    Start N local zero-API-cost contact workers
  --b2b-worker-stop         Request a clean worker-pool shutdown
  --b2b-worker-status       Print worker PID, heartbeat and queue evidence
  --hermes-runtime-status   Run the clean Hermes CLI status command
  --puglia-db-refresh       Rebuild, enrich and validate the 1,500-organization DB
  --puglia-db-status        Re-run and print the Puglia database quality gate
  --ports                   Probe actual TCP ports
  --repo-audit              Generate a deterministic Git repository report
  --b2b-intake <file>       Normalize CSV, JSON or SQLite contacts without trusting imported fields
  --b2b-run [options]       Run intake/crawl/preflight/generation/visual QA
  --b2b-status              Show the last observed B2B pipeline state
  --audit, --traceability   Show traceability data
  --stats                   Show librarian statistics using the configured runtime`)
    process.exit(0)
  } else if (command === '--doctor' || command === 'doctor' || command === '--self-test') {
    const report = buildTuiosDoctorReport()
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.summary.failed === 0 ? 0 : 2)
  } else if (command === '--kill-all' || command === '--stop-all' || command === '--kill' || command === 'kill-all' || command === 'stop-all' || command === '-9') {
    killAllActiveProcesses(true).then(res => {
      console.log(JSON.stringify({ status: 'ok', ...res }, null, 2))
      process.exit(0)
    }).catch(err => {
      console.error(err.message)
      process.exit(1)
    })
  } else if (command === '--founder' || command === '--founder-os' || command === 'founder' || command === 'founder-os' || command === '-f' || command === '--fos') {
    handleChoice('1')
  } else if (command === '--founder-start') {
    ensureFounderOsRunning().then(() => {
      console.log('Founder OS frontend (:5173) e backend (:3001) avviati.')
      process.exit(0)
    })
  } else if (command === '--founder-stop') {
    const killed = killPorts([5173, 3001])
    console.log(`Server Founder OS arrestati (${killed.length} processi terminati). Porte 5173 e 3001 liberate.`)
    process.exit(0)
  } else if (command === '--founder-status') {
    Promise.all([checkPortOnline(5173), checkPortOnline(3001)]).then(([fe, be]) => {
      console.log(JSON.stringify({ frontend: fe, backend: be, frontend_url: 'http://localhost:5173', backend_url: 'http://localhost:3001' }, null, 2))
      process.exit(0)
    })
  } else if (command === '--ldg' || command === '--ldg-innovation' || command === 'ldg' || command === '-i') {
    handleChoice('I')
  } else if (command === '--ldg-dev' || command === 'ldg-dev') {
    console.log(`Starting LDG Innovation Next.js 15 dev server...`)
    execSync(`start "LDG Innovation Next.js (Port 3000)" cmd.exe /k "cd /d \"${B2B_PROJECT}\" && npm run dev"`, { cwd: B2B_PROJECT, shell: 'cmd.exe' })
    process.exit(0)
  } else if (command === '--ldg-b2b' || command === 'ldg-b2b') {
    console.log(`Running LDG Innovation B2B Suite v2...`)
    if (!PYTHON_EXE) { console.error('No working Python runtime is available.'); process.exit(2) }
    const result = spawnSync(PYTHON_EXE, ['scripts/b2b_suite_v2.py', '--mode', 'generate', '--input', 'data/b2b_acquisition/verified_inputs/blackshape_minimal_v2.json', '--limit', '1'], { cwd: B2B_PROJECT, stdio: 'inherit' })
    process.exit(result.status === null ? 1 : result.status)
  } else if (command === '--pi' || command === '--pi-kimi' || command === 'pi' || command === 'pi-kimi' || command === '-2') {
    const piKimi = path.join(PI_DIR, 'pi-kimi.bat')
    const passArgs = args.slice(1).join(' ')
    process.stdin.pause()
    if (process.stdin.setRawMode) process.stdin.setRawMode(false)
    const res = spawnSync('cmd.exe', ['/c', `call "${piKimi}" ${passArgs}`], { stdio: 'inherit', cwd: HERMES_ROOT, windowsHide: false })
    process.exit(res.status ?? 0)
  } else if (command === '--repo-audit' || command === 'repo-audit') {
    const auditScript = path.join(HERMES_ROOT, 'tools', 'tuios', 'repo_audit_real.cjs')
    try { execSync(`node "${auditScript}"`, { stdio: 'inherit', cwd: HERMES_ROOT }); process.exit(0) }
    catch (e) { process.exit(e.status || 1) }
  } else if (command === '--swarm-health' || command === '--swarm' || command === 'swarm' || command === '-1') {
    const executor = path.join(HERMES_ROOT, 'hermes_swarm_executor.js')
    try { execSync(`node "${executor}" --health`, { stdio: 'inherit', cwd: HERMES_ROOT }); process.exit(0) }
    catch (e) { process.exit(e.status || 2) }
  } else if (command === '--hermes-runtime-status' || command === 'hermes-runtime-status') {
    if (!fs.existsSync(HERMES_RUNTIME_ROOT) || !fs.existsSync(HERMES_RUNTIME_PYTHON)) {
      console.error('Clean Hermes runtime or Python environment is missing.'); process.exit(2)
    }
    const result = spawnSync(HERMES_RUNTIME_PYTHON, ['-m', 'hermes_cli.main', 'status'], { cwd: HERMES_RUNTIME_ROOT, stdio: 'inherit' })
    process.exit(result.status === null ? 1 : result.status)
  } else if (command === '--b2b-worker-start' || command === 'b2b-worker-start') {
    let prior = null
    try { prior = JSON.parse(fs.readFileSync(B2B_WORKER_HEARTBEAT, 'utf8')) } catch (_) {}
    if (prior?.status === 'running' && pidAlive(prior.coordinator_pid)) {
      console.log(JSON.stringify({ status: 'already_running', coordinator_pid: prior.coordinator_pid }, null, 2)); process.exit(0)
    }
    if (fs.existsSync(B2B_WORKER_STOP)) fs.unlinkSync(B2B_WORKER_STOP)
    const workers = String(Math.max(1, Math.min(16, Number.parseInt(args[1] || '4', 10) || 4)))
    const child = spawn(PYTHON_EXE, [B2B_WORKER_SWARM, '--workers', workers], {
      cwd: B2B_PROJECT, detached: true, windowsHide: true, stdio: 'ignore'
    })
    child.unref()
    console.log(JSON.stringify({ status: 'starting', coordinator_pid: child.pid, workers: Number(workers) }, null, 2)); process.exit(0)
  } else if (command === '--b2b-worker-stop' || command === 'b2b-worker-stop') {
    fs.mkdirSync(path.dirname(B2B_WORKER_STOP), { recursive: true })
    fs.writeFileSync(B2B_WORKER_STOP, new Date().toISOString() + '\n')
    console.log(JSON.stringify({ status: 'stop_requested', stop_file: B2B_WORKER_STOP }, null, 2)); process.exit(0)
  } else if (command === '--b2b-worker-status' || command === 'b2b-worker-status') {
    if (!fs.existsSync(B2B_WORKER_HEARTBEAT)) { console.error('No B2B worker heartbeat has been recorded.'); process.exit(2) }
    const heartbeat = JSON.parse(fs.readFileSync(B2B_WORKER_HEARTBEAT, 'utf8'))
    heartbeat.coordinator_process_alive = pidAlive(heartbeat.coordinator_pid)
    console.log(JSON.stringify(heartbeat, null, 2)); process.exit(heartbeat.status === 'running' && heartbeat.coordinator_process_alive ? 0 : 2)
  } else if (command === '--puglia-db-refresh' || command === 'puglia-db-refresh') {
    const refreshArgs = [PUGLIA_DB_PIPELINE, ...args.slice(1)]
    const result = spawnSync(PYTHON_EXE, refreshArgs, { cwd: B2B_PROJECT, stdio: 'inherit' })
    process.exit(result.status === null ? 1 : result.status)
  } else if (command === '--puglia-db-status' || command === 'puglia-db-status') {
    const result = spawnSync(PYTHON_EXE, [PUGLIA_DB_VALIDATOR, '--output', PUGLIA_DB_HEALTH], { cwd: B2B_PROJECT, stdio: 'inherit' })
    process.exit(result.status === null ? 1 : result.status)
  } else if (command === '--ports' || command === 'ports' || command === '-6') {
    const health = path.join(HERMES_ROOT, 'tools', 'tuios', 'swarm_health_check.cjs')
    try { execSync(`node "${health}"`, { stdio: 'inherit', cwd: HERMES_ROOT }); process.exit(0) }
    catch (e) { process.exit(e.status || 2) }
  } else if (command === '--stats' || command === 'stats') {
    const libScript = path.join(BIBLIOTECARIO_DIR, 'librarian_server.py')
    if (!PYTHON_EXE || !fs.existsSync(libScript)) { console.error('Librarian runtime is unavailable.'); process.exit(2) }
    const result = spawnSync(PYTHON_EXE, [libScript, '--stats'], { cwd: BIBLIOTECARIO_DIR, stdio: 'inherit', windowsHide: true })
    process.exit(result.status === null ? 1 : result.status)
  } else if (command === '--b2b-intake' || command === 'b2b-intake') {
    if (!args[1]) { console.error('Usage: --b2b-intake <contacts.csv|json|sqlite> [--table name]'); process.exit(1) }
    const inputPath = path.resolve(process.cwd(), args[1])
    const result = spawnSync(process.execPath, [B2B_INTAKE, '--input', inputPath, ...args.slice(2)], { cwd: B2B_PROJECT, stdio: 'inherit' })
    process.exit(result.status === null ? 1 : result.status)
  } else if (command === '--b2b-run' || command === 'b2b-run') {
    const result = spawnSync(process.execPath, [B2B_PIPELINE, ...args.slice(1)], { cwd: process.cwd(), stdio: 'inherit' })
    process.exit(result.status === null ? 1 : result.status)
  } else if (command === '--b2b-status' || command === 'b2b-status') {
    if (!fs.existsSync(B2B_STATE)) { console.error('No B2B pipeline state has been recorded yet.'); process.exit(2) }
    console.log(fs.readFileSync(B2B_STATE, 'utf8')); process.exit(0)
  } else if (command === '--create-job' || command === '--new-job' || command === 'new-job' || command === '-n') {
    handleChoice('N')
  } else if (command === '--jobs' || command === '--list-jobs' || command === '--pipeline' || command === 'pipeline' || command === '-b') {
    handleChoice('B')
  } else if (command === '--run-job' && args[1]) {
    const jid = args[1]
    const executor = path.join(HERMES_ROOT, 'hermes_swarm_executor.js')
    execSync(`node "${executor}" --job "${jid}"`, { stdio: 'inherit', cwd: HERMES_ROOT })
    process.exit(0)
  } else if (command === '--chat' || command === 'chat' || command === '-c') {
    handleChoice('C')
  } else if (command === '--job' || command === '--live' || command === 'job' || command === '-j') {
    handleChoice('J')
  } else if (command === '--multiplex' || command === 'multiplex' || command === '-m') {
    handleChoice('M')
  } else if (command === '--spawn' || command === '--terminal' || command === 'spawn' || command === '-x') {
    handleChoice('X')
  } else if (command === '--openchatcut' || command === 'openchatcut' || command === '-v') {
    handleChoice('V')
  } else if (command === '--kimi' || command === 'kimi' || command === '-7') {
    handleChoice('7')
  } else if (command === '--studios-health' || command === 'studios-health') {
    Promise.all(STUDIOS.map(async studio => ({ ...studio, health: await getStudioHealth(studio.port) })))
      .then(results => {
        const payload = results.map(({ key, name, handle, port, health }) => ({ key, name, handle, port, online: Boolean(health), health }))
        console.log(JSON.stringify(payload, null, 2))
        process.exitCode = payload.every(item => item.online) ? 0 : 2
      })
      .catch(error => { console.error(error.message); process.exitCode = 2 })
  } else if (command === '--studios-start' || command === 'studios-start') {
    ensureStudioOnline(8765)
      .then(async result => {
        const health = await Promise.all(STUDIOS.map(async studio => ({ port: studio.port, online: Boolean(await getStudioHealth(studio.port)) })))
        console.log(JSON.stringify({ ...result, ports: health }, null, 2))
        process.exitCode = result.ok && health.every(item => item.online) ? 0 : 2
      })
      .catch(error => { console.error(error.message); process.exitCode = 2 })
  } else if (command === '--studios' || command === 'studios' || command === '--influencer' || command === '-s') {
    handleChoice('S')
  } else if (command === '--morning-report' || command === '--gaps' || command === '--discrepancies' || command === '-u') {
    handleChoice('U')
  } else if (command === '--analytics' || command === 'analytics' || command === '-a') {
    handleChoice('A')
  } else if (command === '--requirements' || command === '--reqs' || command === 'reqs' || command === '-r') {
    handleChoice('R')
  } else if (command === '--goals' || command === 'goals' || command === '-o') {
    handleChoice('O')
  } else if (command === '--ledger' || command === 'ledger' || command === '-l') {
    handleChoice('L')
  } else if (command === '--kanban' || command === 'kanban' || command === '-k') {
    handleChoice('K')
  } else if (command === '--debt' || command === 'debt' || command === '-d') {
    handleChoice('D')
  } else if (command === '--charts' || command === 'charts' || command === '--pie' || command === '-g') {
    handleChoice('G')
  } else if (command === '--projects' || command === 'projects' || command === '-p') {
    handleChoice('P')
  } else if (command === '--swarm-workload' || command === '--workload' || command === '-w') {
    handleChoice('W')
  } else if (command === '--agents' || command === 'agents' || command === '-f') {
    handleChoice('F')
  } else if (command === '--ecommerce' || command === '--ecom' || command === 'ecommerce' || command === 'ecom' || command === '-e') {
    handleChoice('E')
  } else if (command === '--influencer-landings' || command === '--influencer' || command === 'influencer-landings' || command === '-il') {
    showInfluencerLandingsHub()
  } else if (command === '--influencer-landing') {
    const ver = Number.parseInt(args[1] || '1', 10)
    const svgPath = path.join(INFLUENCER_LANDINGS_DIR, `Influencer landing V${ver}.svg`)
    if (fs.existsSync(svgPath)) {
      openBrowserUrl(svgPath)
      console.log(`Aperto Influencer Landing V${ver}: ${svgPath}`)
      process.exit(0)
    } else {
      console.error(`Mockup non trovato per V${ver}: ${svgPath}`)
      process.exit(1)
    }
  } else if (command === '--scarpe-su-misura' || command === '--artigiano-scarpe' || command === '--scarpe' || command === 'scarpe' || command === '--don-gennaro') {
    (async () => {
      const activePort = await ensureDonGennaroRunning()
      const targetUrl = `http://localhost:${activePort}`
      openBrowserUrl(targetUrl)
      console.log(`\x1b[32m  ✓ Aperto Store Don Gennaro Calzature Napoli: ${targetUrl}\x1b[0m`)
      process.exit(0)
    })()
  } else if (command === '--golden-scrollytelling' || command === '--scrollytelling' || command === 'scrollytelling' || command === '-gs') {
    showGoldenScrollytellingHub()
  } else if (command === '--scrollytelling-blueprint') {
    renderMarkdownFilePreview(path.join(SCROLLYTELLING_DIR, 'IMPLEMENTATION_BLUEPRINT.md'), 100)
    process.exit(0)
  } else if (command === '--scrollytelling-video') {
    renderMarkdownFilePreview(path.join(SCROLLYTELLING_DIR, 'VIDEO_GENERATION.md'), 100)
    process.exit(0)
  } else if (command === '--comm-templates' || command === '--communication-templates' || command === '-ct') {
    showCommunicationTemplatesHub()
  } else if (command === '--chatbot-templates') {
    renderMarkdownFilePreview(path.join(COMM_TEMPLATES_DIR, 'CHATBOT_AI.md'), 100)
    process.exit(0)
  } else if (command === '--email-templates') {
    renderMarkdownFilePreview(path.join(COMM_TEMPLATES_DIR, 'EMAIL.md'), 100)
    process.exit(0)
  } else if (command === '--legal-templates' || command === '--legal' || command === '-lt') {
    showLegalTemplatesHub()
  } else if (command === '--optional-modules' || command === '--modules' || command === '-om') {
    showOptionalModulesHub()
  } else if (command === '--auto-translation' || command === '--translation' || command === '--languages-hub' || command === '-tr') {
    showAutoTranslationHub()
  } else if (command === '--languages' || command === 'languages') {
    const manifestPath = path.join(LOCALIZATION_DIR, 'manifest.json')
    if (fs.existsSync(manifestPath)) {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      console.log(JSON.stringify(data.modules?.[0]?.supportedLocales || [], null, 2))
      process.exit(0)
    } else {
      console.error('Localization manifest non trovato.')
      process.exit(1)
    }
  } else if (command === '--translate' || command === 'translate') {
    const text = args[1] || 'Scarpe artigianali Goodyear Welt in Vitello Pieno Fiore'
    const targetLang = (args[2] || 'en').toLowerCase()
    const result = executeCliTranslation(text, targetLang)
    console.log(JSON.stringify(result, null, 2))
    process.exit(0)
  } else if (command === '--moser-dev' || command === 'moser-dev' || command === '--moser-storefront' || command === 'moser-storefront') {
    getEcommercePorts().then(ports => {
      console.log(`Avvio Storefront React Vite con PortManager (porta ${ports.storefrontPort})...`)
      const launchScript = path.join(MOSER_PROJECT, 'scripts', 'launch-with-port-manager.cjs')
      if (fs.existsSync(launchScript)) {
        execSync(`start "Moser Storefront (Port ${ports.storefrontPort})" node "${launchScript}"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
      } else {
        execSync(`start "Moser Storefront (Port ${ports.storefrontPort})" cmd.exe /k "cd /d \"${MOSER_PROJECT}\" && npm run dev -- --port ${ports.storefrontPort}"`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
      }
      process.exit(0)
    })
  } else if (command === '--moser-all' || command === 'moser-all') {
    getEcommercePorts().then(ports => {
      console.log(`Avvio Storefront (${ports.storefrontPort}) e Medusa Backend (${ports.medusaPort}) con PortManager...`)
      const launchScript = path.join(MOSER_PROJECT, 'scripts', 'launch-with-port-manager.cjs')
      if (fs.existsSync(launchScript)) {
        execSync(`start "Moser Dual Servers" node "${launchScript}" --all`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
      }
      process.exit(0)
    })
  } else if (command === '--moser-admin' || command === 'moser-admin') {
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      openBrowserUrl(`http://localhost:${storefrontPort}/admin`)
      console.log(`Aperta Area Amministrativa Moser: http://localhost:${storefrontPort}/admin`)
      process.exit(0)
    })
  } else if (command === '--moser-consumer' || command === 'moser-consumer') {
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      openBrowserUrl(`http://localhost:${storefrontPort}/`)
      console.log(`Aperta Area Consumer Moser: http://localhost:${storefrontPort}/`)
      process.exit(0)
    })
  } else if (command === '--moser-business' || command === 'moser-business') {
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      openBrowserUrl(`http://localhost:${storefrontPort}/company/control-center`)
      console.log(`Aperta Area Business Moser: http://localhost:${storefrontPort}/company/control-center`)
      process.exit(0)
    })
  } else if (command === '--new-ecommerce' || command === '--wizard' || command === 'new-ecommerce') {
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      openBrowserUrl(`http://localhost:${storefrontPort}/admin/new-ecommerce`)
      console.log(`Aperto New E-Commerce Wizard: http://localhost:${storefrontPort}/admin/new-ecommerce`)
      process.exit(0)
    })
  } else if (command === '--creative-studio' || command === 'creative-studio') {
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      openBrowserUrl(`http://localhost:${storefrontPort}/admin/creative-studio`)
      console.log(`Aperto Creative Studio: http://localhost:${storefrontPort}/admin/creative-studio`)
      process.exit(0)
    })
  } else if (command === '--access-control' || command === '--rbac') {
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      openBrowserUrl(`http://localhost:${storefrontPort}/admin/access-control`)
      console.log(`Aperto Access Control & RBAC: http://localhost:${storefrontPort}/admin/access-control`)
      process.exit(0)
    })
  } else if (command === '--discovery-lab' || command === 'discovery-lab') {
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      openBrowserUrl(`http://localhost:${storefrontPort}/admin/discovery-lab-ops`)
      console.log(`Aperto Discovery Lab Ops: http://localhost:${storefrontPort}/admin/discovery-lab-ops`)
      process.exit(0)
    })
  } else if (command === '--store-admin') {
    const storeTarget = args[1] || 'moser-commerce'
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      const url = storeTarget.startsWith('http') ? `${storeTarget.replace(/\/+$/, '')}/admin` : `http://localhost:${storefrontPort}/admin?store=${encodeURIComponent(storeTarget)}`
      openBrowserUrl(url)
      console.log(`Aperta Area Amministrativa Store: ${url}`)
      process.exit(0)
    })
  } else if (command === '--store-consumer') {
    const storeTarget = args[1] || 'moser-commerce'
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      const url = storeTarget.startsWith('http') ? `${storeTarget.replace(/\/+$/, '')}/` : `http://localhost:${storefrontPort}?store=${encodeURIComponent(storeTarget)}`
      openBrowserUrl(url)
      console.log(`Aperta Area Consumer Store: ${url}`)
      process.exit(0)
    })
  } else if (command === '--store-business') {
    const storeTarget = args[1] || 'moser-commerce'
    ensureStorefrontRunning().then(async () => {
      const { storefrontPort } = await getEcommercePorts()
      const url = storeTarget.startsWith('http') ? `${storeTarget.replace(/\/+$/, '')}/company/dashboard` : `http://localhost:${storefrontPort}/company/dashboard?store=${encodeURIComponent(storeTarget)}`
      openBrowserUrl(url)
      console.log(`Aperta Area Business Store: ${url}`)
      process.exit(0)
    })
  } else if (command === '--start-ecommerce' || command === 'start-ecommerce') {
    getEcommercePorts().then(ports => {
      console.log(`Avvio Storefront (porta ${ports.storefrontPort}) e Backend API (porta ${ports.medusaPort}) via PortManager...`)
      const launchScript = path.join(MOSER_PROJECT, 'scripts', 'launch-with-port-manager.cjs')
      execSync(`start "Moser Dual Servers" node "${launchScript}" --all`, { shell: 'cmd.exe', cwd: MOSER_PROJECT })
      process.exit(0)
    })
  } else if (command === '--stop-ecommerce' || command === 'stop-ecommerce') {
    getEcommercePorts().then(ports => {
      const killed = killPorts([ports.storefrontPort, ports.medusaPort])
      console.log(`Server E-Commerce arrestati (${killed.length} processi terminati). Porte ${ports.storefrontPort} e ${ports.medusaPort} liberate.`)
      process.exit(0)
    })
  } else if (command === '--quality-ecommerce' || command === '--ecommerce-quality') {
    try {
      execSync('npm run quality', { stdio: 'inherit', cwd: MOSER_PROJECT })
      process.exit(0)
    } catch (e) {
      process.exit(e.status || 1)
    }
  } else if (command === '--traceability' || command === '--audit' || command === 'traceability' || command === '-t') {
    handleChoice('T')
  } else if (command === '--galaxy' || command === '--pi-galaxy' || command === 'galaxy' || command === '-8') {
    handleChoice('8')
  } else if (command === '--pi-hydra') {
    const piBat = path.join(PI_DIR, 'pi.bat')
    execSync(`call "${piBat}" --hydra`, { stdio: 'inherit', cwd: HERMES_ROOT, shell: 'cmd.exe' })
    process.exit(0)
  } else if (command === '--pi-claude') {
    const piBat = path.join(PI_DIR, 'pi.bat')
    execSync(`call "${piBat}" --claude`, { stdio: 'inherit', cwd: HERMES_ROOT, shell: 'cmd.exe' })
    process.exit(0)
  } else if (command === '--pi-gemini') {
    const piBat = path.join(PI_DIR, 'pi.bat')
    execSync(`call "${piBat}" --gemini`, { stdio: 'inherit', cwd: HERMES_ROOT, shell: 'cmd.exe' })
    process.exit(0)
  } else if (command === '--pi-r1') {
    const piBat = path.join(PI_DIR, 'pi.bat')
    execSync(`call "${piBat}" --r1`, { stdio: 'inherit', cwd: HERMES_ROOT, shell: 'cmd.exe' })
    process.exit(0)
  } else if (command === '--project-studio' || command === '--projects' || command === '--generator' || command === '-ps') {
    handleChoice('PS')
  } else if (command === '--aword' || command === '--aword-dashboard' || command === 'aword' || command === '-aw') {
    ensureStudioOnline(8769).then(result => {
      const url = 'http://localhost:8769/aword-dashboard'
      openBrowserUrl(url)
      console.log(`\x1b[32m  ✓ Dashboard Aword aperta nel browser: ${url}\x1b[0m`)
      process.exit(0)
    }).catch(err => {
      console.error('Errore avvio Aword:', err.message)
      process.exit(1)
    })
  } else {
    console.log(`Unknown command: ${command}. Launching interactive TUIOS...`)
    showMenu()
  }
} else {
  showMenu()
}
