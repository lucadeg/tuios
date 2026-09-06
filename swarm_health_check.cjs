#!/usr/bin/env node
'use strict'

/**
 * Hermes Sovereign Swarm & Master Workspace Health Monitor
 * Probes all runtime ports, active agent processes, MechaHD projects (28),
 * Toolbox utilities (72), SQLite databases, and Workflow 1-14 state.
 */

const fs = require('fs')
const path = require('path')
const net = require('net')
const { execSync } = require('child_process')

const ROOT = 'C:\\Users\\Deglu\\.hermes'
const MECHA_DIR = path.join(ROOT, 'mechaHD')
const TOOLS_DIR = path.join(ROOT, 'tools')
const STATE_DB = path.join(ROOT, 'state.db')
const LEDGER_DB = path.join(ROOT, 'tools', 'swarm_goals', 'immutable_execution_ledger.db')
const GOALS_REGISTRY = path.join(ROOT, 'tools', 'swarm_goals', 'atomic_goals_registry.json')

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
}

// 1. Port Probe Helper
function probePort(port) {
  return new Promise(resolve => {
    if (!port) return resolve({ port, status: 'closed' })
    const socket = net.createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(400)
    socket.on('connect', () => { socket.destroy(); resolve({ port, status: 'listening' }) })
    socket.on('timeout', () => { socket.destroy(); resolve({ port, status: 'closed' }) })
    socket.on('error', () => { resolve({ port, status: 'closed' }) })
  })
}

// 2. Discover Running Processes on Windows
function getActiveProcesses() {
  const patterns = ['python', 'node', 'pi.bat', 'main.py', 'kimi_k3', 'serve_galaxy_brain', 'hermes-cli', 'next', 'pnpm']
  try {
    const psCmd = `$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'kimi|hydra|galaxy|pi|hermes|next|paperclip|buzz' } | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`
    const out = execSync(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf8', timeout: 5000 }).trim()
    if (!out) return []
    const parsed = JSON.parse(out)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list.filter(p => !String(p.CommandLine || '').includes('Get-CimInstance'))
  } catch (_) {
    return null
  }
}

// 3. Scan MechaHD Projects
function scanMechaProjects() {
  if (!fs.existsSync(MECHA_DIR)) return []
  return fs.readdirSync(MECHA_DIR).filter(f => {
    const p = path.join(MECHA_DIR, f)
    return fs.statSync(p).isDirectory() && !f.startsWith('.')
  }).map(name => {
    const p = path.join(MECHA_DIR, name)
    const hasNext = fs.existsSync(path.join(p, 'next.config.js')) || fs.existsSync(path.join(p, 'next.config.mjs')) || fs.existsSync(path.join(p, 'next.config.ts'))
    const hasPy = fs.existsSync(path.join(p, 'requirements.txt')) || fs.existsSync(path.join(p, 'main.py')) || fs.existsSync(path.join(p, 'pyproject.toml'))
    const hasPkg = fs.existsSync(path.join(p, 'package.json'))
    const hasMatrix = fs.existsSync(path.join(p, 'PROJECT_TRACEABILITY_MATRIX.json'))
    
    let tech = 'Generic'
    if (hasNext) tech = 'Next.js 15'
    else if (hasPkg) tech = 'Node.js/React'
    else if (hasPy) tech = 'Python 3.11'

    let port = null
    if (name === 'LDG_INNOVATION') port = 3000
    if (name === 'JARVIS 3FOLD') port = 8090

    return { name, path: p, tech, port, hasMatrix }
  })
}

// 4. Scan Toolbox
function scanToolbox() {
  if (!fs.existsSync(TOOLS_DIR)) return []
  return fs.readdirSync(TOOLS_DIR).filter(f => {
    const p = path.join(TOOLS_DIR, f)
    return fs.statSync(p).isDirectory() && !f.startsWith('.') && f !== '__pycache__'
  })
}

// 5. Main Execution
async function main() {
  console.log(`\n${COLORS.cyan}${COLORS.bright}╔════════════════════════════════════════════════════════════════════════════════════════╗`)
  console.log(`║ ⚡ HERMES MASTER RUNTIME, SERVICES, MECHAHD & TOOLBOX HEALTH MONITOR                    ║`)
  console.log(`║    TCP probes, filesystem inventory and process sensor status                           ║`)
  console.log(`╚════════════════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`)

  // Define All Services
  const serviceDefs = [
    { name: 'Pi Galaxy Brain HUD & Master Server', port: 5199, role: 'Master Control Hub & REPL' },
    { name: 'Kimi-compatible Provider Endpoint', port: 8095, role: 'Compatibility router; local checkpoint checked separately' },
    { name: 'Hydra Task Router (Multi-Model)', port: 8090, role: 'Claude, Gemini, DeepSeek R1' },
    { name: 'LDG Innovation Hub (Next.js 15)', port: 3000, role: 'Enterprise Flagship Platform' },
    { name: 'LDG Innovation PostgreSQL', port: 5432, role: 'Operational database required by health checks' },
    { name: 'Paperclip Swarm Control Plane', port: 3100, role: 'AI-Agent Company Management' },
    { name: 'Hermes IDE Unchained', port: 5195, role: 'Sovereign IDE & 3D Dashboard' },
    { name: 'Hermes Office 3D Canvas', port: 3001, role: 'OpenClaw Next.js 16 3D Space' },
    { name: 'Block Buzz Nostr Relay', port: 3005, role: 'Nostr NIP-29 Group Event Bus' },
    { name: 'Maxun Visual Autonomous Scraper', port: 8080, role: 'No-Code Autonomous Data Extraction' },
    { name: 'Hydra Router Core (Legacy)', port: 3033, role: 'Legacy Port Forwarder' },
  ]

  // Probe all ports
  const probedPorts = await Promise.all(serviceDefs.map(async s => {
    const res = await probePort(s.port)
    return { ...s, status: res.status }
  }))

  const onlineServices = probedPorts.filter(p => p.status === 'listening')
  const standbyServices = probedPorts.filter(p => p.status !== 'listening')

  // Processes
  const procs = getActiveProcesses()
  
  // MechaHD & Toolbox
  const mechaProjects = scanMechaProjects()
  const toolbox = scanToolbox()

  // Print Section 1: Services Status
  console.log(`  ${COLORS.bright}1. CORE RUNTIME SERVICES & PORTS STATUS (${onlineServices.length}/${probedPorts.length} ONLINE):${COLORS.reset}`)
  probedPorts.forEach(s => {
    const isOnline = s.status === 'listening'
    const statusPill = isOnline ? `${COLORS.green}🟢 ONLINE (LISTENING)${COLORS.reset}` : `${COLORS.yellow}🟡 STANDBY (OFFLINE)${COLORS.reset}`
    console.log(`  • ${COLORS.cyan}:${s.port}${COLORS.reset} ${s.name.padEnd(38, ' ')} ➔ ${statusPill} ${COLORS.dim}(${s.role})${COLORS.reset}`)
  })

  // Print Section 2: Active Processes
  console.log(`\n  ${COLORS.bright}2. ACTIVE DAEMONS & HARNESS PROCESSES (${procs ? `${procs.length} DETECTED` : 'SENSOR UNAVAILABLE'}):${COLORS.reset}`)
  if (procs && procs.length > 0) {
    procs.slice(0, 8).forEach(p => {
      console.log(`  • [PID ${COLORS.yellow}${p.ProcessId}${COLORS.reset}] ${COLORS.green}${p.Name}${COLORS.reset} | ${COLORS.dim}${String(p.CommandLine || '').slice(0, 75)}...${COLORS.reset}`)
    })
  } else if (procs) {
    console.log(`  • ${COLORS.dim}No detached background daemons detected in process table.${COLORS.reset}`)
  } else {
    console.log(`  • ${COLORS.yellow}Process inventory could not be read; port probes remain authoritative.${COLORS.reset}`)
  }

  // Print Section 3: MechaHD Projects Mapping
  console.log(`\n  ${COLORS.bright}3. MECHAHD AUTONOMOUS ENTERPRISE PROJECTS (${mechaProjects.length} INDEXED):${COLORS.reset}`)
  const sampleMecha = mechaProjects.slice(0, 10)
  sampleMecha.forEach(p => {
    const portStr = p.port ? `:${p.port}` : 'READY'
    const matrixStr = p.hasMatrix ? `${COLORS.cyan}[REQ-MVX MATRIX]${COLORS.reset}` : `${COLORS.dim}[STANDARD]${COLORS.reset}`
    console.log(`  • ${COLORS.yellow}${p.name.padEnd(24, ' ')}${COLORS.reset} | Stack: ${p.tech.padEnd(14, ' ')} | Port: ${portStr.padEnd(6, ' ')} | ${matrixStr}`)
  })
  if (mechaProjects.length > 10) {
    console.log(`    ${COLORS.dim}... e altri ${mechaProjects.length - 10} progetti in mechaHD/ (vedi Galaxy Brain per la lista completa)${COLORS.reset}`)
  }

  // Print Section 4: Toolbox Manager Mapping
  console.log(`\n  ${COLORS.bright}4. TOOLBOX DIRECTORIES (${toolbox.length} INDEXED):${COLORS.reset}`)
  console.log(`  • ${COLORS.cyan}Paperclip${COLORS.reset} (Port :3100) · ${COLORS.cyan}Buzz${COLORS.reset} (Port :3005) · ${COLORS.cyan}Kimi-compatible endpoint${COLORS.reset} (Port :8095) · ${COLORS.cyan}Pi Coding Agent${COLORS.reset}`)
  console.log(`  • ${COLORS.dim}Tools catalog: ${toolbox.slice(0, 12).join(', ')} ... (${toolbox.length} tools)${COLORS.reset}`)

  // Print Section 5: Databases & Memory
  console.log(`\n  ${COLORS.bright}5. IMMUTABLE MEMORY & SQLITE DATA STORES:${COLORS.reset}`)
  try {
    const sStat = fs.existsSync(STATE_DB) ? `${(fs.statSync(STATE_DB).size / (1024*1024)).toFixed(2)} MB` : 'N/A'
    const lStat = fs.existsSync(LEDGER_DB) ? `${(fs.statSync(LEDGER_DB).size / (1024*1024)).toFixed(2)} MB` : 'N/A'
    let goalsLabel = 'N/A'
    if (fs.existsSync(GOALS_REGISTRY)) {
      const goals = JSON.parse(fs.readFileSync(GOALS_REGISTRY, 'utf8'))
      goalsLabel = `${goals.total_goals_count ?? goals.goals?.length ?? 0} goals / ${goals.phases_count ?? goals.workflow_phases?.length ?? 0} phases`
    }
    console.log(`  • state.db: ${COLORS.green}${sStat}${COLORS.reset} | ledger.db: ${COLORS.green}${lStat}${COLORS.reset} (file presence only) | Goals Registry: ${COLORS.green}${goalsLabel}${COLORS.reset}`)
  } catch (_) {}

  console.log(`\n  ──────────────────────────────────────────────────────────────────────────────────────────`)
  const allOnline = standbyServices.length === 0
  console.log(`  ${COLORS.bright}VERDETTO SISTEMA:${COLORS.reset} ${allOnline ? `${COLORS.green}🟢 TUTTI I SERVIZI MONITORATI ONLINE` : `${COLORS.yellow}🟡 DEGRADATO: ${onlineServices.length}/${probedPorts.length} SERVIZI ONLINE`}${COLORS.reset}`)
  console.log(`  💡 Per avviare tutti i servizi con 1-click apri il Master Hub: ${COLORS.cyan}http://127.0.0.1:5199${COLORS.reset}`)
  console.log(`  ──────────────────────────────────────────────────────────────────────────────────────────\n`)

  process.exitCode = allOnline ? 0 : 2
}

main().catch(err => {
  console.error(`Errore monitoraggio: ${err.message}`)
  process.exit(1)
})
