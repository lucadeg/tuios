/**
 * TUIOS — Hermes Terminal UI Operating System & Multiplexer Engine
 * Implements full modal window management, BSP/Quad/Split layouts, Command Palette,
 * themes, live real-time ticking, dockbar, zoom mode, and multi-job telemetry.
 * Pixel-perfect ANSI-aware box drawing engine.
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { spawnSync } = require('child_process')

const HERMES_ROOT = path.resolve(__dirname, '..', '..')

// ─────────────────────────────────────────────────────────────────────────────
// ANSI STRING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function stripAnsi(str) {
  return String(str || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

function visibleLength(str) {
  return stripAnsi(str).length
}

function truncateAnsi(str, maxLen) {
  const plain = stripAnsi(str)
  if (plain.length <= maxLen) return str
  let res = ''
  let vis = 0
  let inEscape = false
  let escapeSeq = ''
  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    if (char === '\x1b') {
      inEscape = true
      escapeSeq = char
      continue
    }
    if (inEscape) {
      escapeSeq += char
      if ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')) {
        inEscape = false
        res += escapeSeq
        escapeSeq = ''
      }
      continue
    }
    if (vis < maxLen - 1) {
      res += char
      vis++
    } else if (vis === maxLen - 1) {
      res += '…'
      vis++
      break
    }
  }
  res += '\x1b[0m'
  return res
}

function fitAnsi(str, targetWidth) {
  const vis = visibleLength(str)
  if (vis > targetWidth) {
    return truncateAnsi(str, targetWidth)
  }
  return str + ' '.repeat(Math.max(0, targetWidth - vis))
}

// ─────────────────────────────────────────────────────────────────────────────
// THEMES PALETTE (TokyoNight, Dracula, Nord, Monokai Pro, Cyberpunk)
// ─────────────────────────────────────────────────────────────────────────────

const THEMES = {
  tokyonight: {
    name: 'TokyoNight',
    borderActive: '\x1b[38;2;122;162;247m',   // #7aa2f7 Bright Blue
    borderInactive: '\x1b[38;2;65;72;104m',   // #414868 Muted Blue-Grey
    titleActive: '\x1b[48;2;122;162;247m\x1b[38;2;26;27;38m\x1b[1m',
    titleInactive: '\x1b[48;2;41;46;66m\x1b[38;2;169;177;214m',
    accent: '\x1b[38;2;122;162;247m',
    success: '\x1b[38;2;158;206;106m',
    warning: '\x1b[38;2;224;175;104m',
    error: '\x1b[38;2;247;118;142m',
    cyan: '\x1b[38;2;125;207;255m',
    magenta: '\x1b[38;2;187;154;247m',
    dim: '\x1b[38;2;100;105;130m',
    dockBg: '\x1b[48;2;22;22;30m',
    dockFg: '\x1b[38;2;169;177;214m',
    dockActive: '\x1b[48;2;122;162;247m\x1b[38;2;26;27;38m\x1b[1m',
    dockPill: '\x1b[48;2;41;46;66m\x1b[38;2;192;202;245m',
  },
  dracula: {
    name: 'Dracula',
    borderActive: '\x1b[38;2;189;147;249m',   // #bd93f9 Purple
    borderInactive: '\x1b[38;2;68;71;90m',
    titleActive: '\x1b[48;2;189;147;249m\x1b[38;2;40;42;54m\x1b[1m',
    titleInactive: '\x1b[48;2;68;71;90m\x1b[38;2;248;248;242m',
    accent: '\x1b[38;2;189;147;249m',
    success: '\x1b[38;2;80;250;123m',
    warning: '\x1b[38;2;241;250;140m',
    error: '\x1b[38;2;255;85;85m',
    cyan: '\x1b[38;2;139;233;253m',
    magenta: '\x1b[38;2;255;121;198m',
    dim: '\x1b[38;2;98;114;164m',
    dockBg: '\x1b[48;2;33;34;44m',
    dockFg: '\x1b[38;2;248;248;242m',
    dockActive: '\x1b[48;2;189;147;249m\x1b[38;2;40;42;54m\x1b[1m',
    dockPill: '\x1b[48;2;68;71;90m\x1b[38;2;248;248;242m',
  },
  nord: {
    name: 'Nord',
    borderActive: '\x1b[38;2;136;192;208m',   // #88c0d0 Frost Cyan
    borderInactive: '\x1b[38;2;76;86;106m',
    titleActive: '\x1b[48;2;136;192;208m\x1b[38;2;46;52;64m\x1b[1m',
    titleInactive: '\x1b[48;2;67;76;94m\x1b[38;2;236;239;244m',
    accent: '\x1b[38;2;136;192;208m',
    success: '\x1b[38;2;163;190;140m',
    warning: '\x1b[38;2;235;203;139m',
    error: '\x1b[38;2;191;97;106m',
    cyan: '\x1b[38;2;143;188;187m',
    magenta: '\x1b[38;2;180;142;173m',
    dim: '\x1b[38;2;94;105;127m',
    dockBg: '\x1b[48;2;46;52;64m',
    dockFg: '\x1b[38;2;236;239;244m',
    dockActive: '\x1b[48;2;136;192;208m\x1b[38;2;46;52;64m\x1b[1m',
    dockPill: '\x1b[48;2;67;76;94m\x1b[38;2;236;239;244m',
  },
  monokai: {
    name: 'Monokai Pro',
    borderActive: '\x1b[38;2;255;216;102m',   // Yellow
    borderInactive: '\x1b[38;2;90;80;90m',
    titleActive: '\x1b[48;2;255;216;102m\x1b[38;2;45;42;46m\x1b[1m',
    titleInactive: '\x1b[48;2;64;62;65m\x1b[38;2;252;252;250m',
    accent: '\x1b[38;2;255;216;102m',
    success: '\x1b[38;2;169;220;103m',
    warning: '\x1b[38;2;255;157;0m',
    error: '\x1b[38;2;255;97;136m',
    cyan: '\x1b[38;2;120;220;232m',
    magenta: '\x1b[38;2;171;157;242m',
    dim: '\x1b[38;2;114;112;114m',
    dockBg: '\x1b[48;2;34;31;34m',
    dockFg: '\x1b[38;2;252;252;250m',
    dockActive: '\x1b[48;2;255;216;102m\x1b[38;2;45;42;46m\x1b[1m',
    dockPill: '\x1b[48;2;64;62;65m\x1b[38;2;252;252;250m',
  },
  cyberpunk: {
    name: 'Cyberpunk Neon',
    borderActive: '\x1b[38;2;0;255;234m',    // Neon Cyan
    borderInactive: '\x1b[38;2;70;30;80m',
    titleActive: '\x1b[48;2;0;255;234m\x1b[38;2;10;10;20m\x1b[1m',
    titleInactive: '\x1b[48;2;50;20;60m\x1b[38;2;255;0;128m',
    accent: '\x1b[38;2;0;255;234m',
    success: '\x1b[38;2;57;255;20m',
    warning: '\x1b[38;2;255;230;0m',
    error: '\x1b[38;2;255;0;85m',
    cyan: '\x1b[38;2;0;255;234m',
    magenta: '\x1b[38;2;255;0;128m',
    dim: '\x1b[38;2;100;40;110m',
    dockBg: '\x1b[48;2;15;10;25m',
    dockFg: '\x1b[38;2;0;255;234m',
    dockActive: '\x1b[48;2;255;0;128m\x1b[38;2;255;255;255m\x1b[1m',
    dockPill: '\x1b[48;2;40;15;50m\x1b[38;2;0;255;234m',
  }
}

const THEME_KEYS = Object.keys(THEMES)
let currentThemeIdx = 0

function getTheme() {
  return THEMES[THEME_KEYS[currentThemeIdx]]
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHING & LIVE STATE
// ─────────────────────────────────────────────────────────────────────────────

function fetchMultiJobsState() {
  const bridge = path.join(HERMES_ROOT, 'tools', 'tuios', 'hermes_data_bridge.py')
  const candidates = [
    process.env.TUIOS_PYTHON,
    path.join('C:\\Users\\Deglu\\.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    'python',
  ].filter(Boolean)
  for (const python of candidates) {
    const result = spawnSync(python, [bridge], { encoding: 'utf8', cwd: HERMES_ROOT, timeout: 12000, windowsHide: true })
    if (!result.error && result.status === 0) {
      try {
        const metrics = JSON.parse(result.stdout)
        const live = metrics.live_swarm_job || {}
        const registered = metrics.swarm_jobs?.jobs || []
        const jobs = []
        if (live.available) jobs.push(live)
        for (const job of registered) {
          if (!jobs.some(item => item.job_id === job.id)) jobs.push({ ...job, job_id: job.id, runtime_live: false, source: 'swarm_jobs_registry.json' })
        }
        return { jobs, metrics, source: bridge, available: true }
      } catch (_) {}
    }
  }
  return { jobs: [], metrics: {}, source: null, available: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// TUIOS STATE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

class TuiosEngine {
  constructor(onExitCallback) {
    this.onExit = onExitCallback
    this.focusedPane = 0 // 0: Job1, 1: Job2, 2: Ledger, 3: Protocol/Ports
    this.zoomed = false
    this.currentWorkspace = 1 // 1: Matrix, 2: 10H Audit, 3: B2B Pipeline, 4: Ledger, 5: Shell
    this.layout = 'quad' // 'quad', 'dual_v', 'dual_h', 'master'
    this.showPalette = false
    this.paletteSearch = ''
    this.paletteSelected = 0
    this.showHelp = false
    this.tickTimer = null
    this.state = fetchMultiJobsState()
  }

  start() {
    process.stdout.write('\x1b[?1049h\x1b[?25l')

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      readline.emitKeypressEvents(process.stdin)
      this.keyHandler = (str, key) => this.handleKeypress(str, key)
      process.stdin.on('keypress', this.keyHandler)
    }

    this.resizeHandler = () => this.render()
    process.stdout.on('resize', this.resizeHandler)

    this.tickTimer = setInterval(() => {
      this.state = fetchMultiJobsState()
      this.render()
    // The bridge gathers several live OS/service probes. Refreshing it every
    // second blocks input on slower Windows/WSL hosts and adds no useful
    // operator signal, so keep the dashboard responsive with a 5s cadence.
    }, 5000)

    this.render()
  }

  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer)
    if (this.resizeHandler) process.stdout.removeListener('resize', this.resizeHandler)
    if (this.keyHandler && process.stdin.isTTY) {
      process.stdin.removeListener('keypress', this.keyHandler)
      process.stdin.setRawMode(false)
    }
    process.stdout.write('\x1b[?1049l\x1b[?25h')
    if (this.onExit) this.onExit()
  }

  handleKeypress(str, key) {
    if (!key) return

    if ((key.ctrl && key.name === 'c') || (!this.showPalette && !this.showHelp && key.name === 'q')) {
      this.stop()
      return
    }

    if (this.showPalette) {
      if (key.name === 'escape') {
        this.showPalette = false
        this.paletteSearch = ''
        this.render()
        return
      }
      if (key.name === 'up') {
        this.paletteSelected = Math.max(0, this.paletteSelected - 1)
        this.render()
        return
      }
      if (key.name === 'down') {
        this.paletteSelected = Math.min(this.getFilteredPaletteActions().length - 1, this.paletteSelected + 1)
        this.render()
        return
      }
      if (key.name === 'return') {
        const actions = this.getFilteredPaletteActions()
        if (actions[this.paletteSelected]) {
          actions[this.paletteSelected].run()
        }
        this.showPalette = false
        this.paletteSearch = ''
        this.render()
        return
      }
      if (key.name === 'backspace') {
        this.paletteSearch = this.paletteSearch.slice(0, -1)
        this.paletteSelected = 0
        this.render()
        return
      }
      if (str && str.length === 1 && !key.ctrl && !key.meta) {
        this.paletteSearch += str
        this.paletteSelected = 0
        this.render()
        return
      }
      return
    }

    if (this.showHelp) {
      if (key.name === 'escape' || key.name === 'q' || str === '?') {
        this.showHelp = false
        this.render()
      }
      return
    }

    if ((key.ctrl && key.name === 'p') || str === 'p') {
      this.showPalette = true
      this.paletteSearch = ''
      this.paletteSelected = 0
      this.render()
      return
    }

    if (str === '?') {
      this.showHelp = true
      this.render()
      return
    }

    if (str === 'z' || key.name === 'return') {
      this.zoomed = !this.zoomed
      this.render()
      return
    }

    if (str === 't') {
      currentThemeIdx = (currentThemeIdx + 1) % THEME_KEYS.length
      this.render()
      return
    }

    if (key.name === 'space') {
      const modes = ['quad', 'dual_v', 'dual_h']
      const curIdx = modes.indexOf(this.layout)
      this.layout = modes[(curIdx + 1) % modes.length]
      this.render()
      return
    }

    if (str >= '1' && str <= '5') {
      this.currentWorkspace = parseInt(str, 10)
      if (this.currentWorkspace === 1) { this.zoomed = false }
      else if (this.currentWorkspace === 2) { this.focusedPane = 0; this.zoomed = true }
      else if (this.currentWorkspace === 3) { this.focusedPane = 1; this.zoomed = true }
      else if (this.currentWorkspace === 4) { this.focusedPane = 2; this.zoomed = true }
      else if (this.currentWorkspace === 5) { this.focusedPane = 3; this.zoomed = true }
      this.render()
      return
    }

    if (key.name === 'tab') {
      if (key.shift) {
        this.focusedPane = (this.focusedPane + 3) % 4
      } else {
        this.focusedPane = (this.focusedPane + 1) % 4
      }
      this.render()
      return
    }

    if (key.name === 'left' || str === 'h') {
      if (this.focusedPane === 1) this.focusedPane = 0
      else if (this.focusedPane === 3) this.focusedPane = 2
      this.render()
      return
    }
    if (key.name === 'right' || str === 'l') {
      if (this.focusedPane === 0) this.focusedPane = 1
      else if (this.focusedPane === 2) this.focusedPane = 3
      this.render()
      return
    }
    if (key.name === 'up' || str === 'k') {
      if (this.focusedPane === 2) this.focusedPane = 0
      else if (this.focusedPane === 3) this.focusedPane = 1
      this.render()
      return
    }
    if (key.name === 'down' || str === 'j') {
      if (this.focusedPane === 0) this.focusedPane = 2
      else if (this.focusedPane === 1) this.focusedPane = 3
      this.render()
      return
    }
  }

  getFilteredPaletteActions() {
    const all = [
      { name: 'Layout: BSP Quad Matrix (4 Panes)', run: () => { this.layout = 'quad'; this.zoomed = false } },
      { name: 'Layout: Dual Vertical (50/50 Split)', run: () => { this.layout = 'dual_v'; this.zoomed = false } },
      { name: 'Layout: Dual Horizontal Split', run: () => { this.layout = 'dual_h'; this.zoomed = false } },
      { name: 'Window: Toggle Zoom (Fullscreen Pane)', run: () => { this.zoomed = !this.zoomed } },
      { name: 'Job: Focus 10H Ecosystem Codebase Audit', run: () => { this.focusedPane = 0; this.zoomed = true } },
      { name: 'Job: Focus LDG INNOVATION B2B Pipeline Engine', run: () => { this.focusedPane = 1; this.zoomed = true } },
      { name: 'Ledger: Focus Stored Audit Records', run: () => { this.focusedPane = 2; this.zoomed = true } },
      { name: 'Protocol: Focus Agent Shell & Gateway Ports', run: () => { this.focusedPane = 3; this.zoomed = true } },
      { name: 'Theme: Cycle Color Palette (TokyoNight/Dracula/Nord/Monokai/Cyberpunk)', run: () => { currentThemeIdx = (currentThemeIdx + 1) % THEME_KEYS.length } },
      { name: 'System: Trigger Live Telemetry Rescan', run: () => { this.state = fetchMultiJobsState() } },
      { name: 'TUIOS: Exit to Main Terminal Menu', run: () => { this.stop() } }
    ]
    if (!this.paletteSearch) return all
    const q = this.paletteSearch.toLowerCase()
    return all.filter(a => a.name.toLowerCase().includes(q))
  }

  renderBar(pct, total = 100, length = 14, t) {
    const val = Math.min(100, Math.max(0, pct || 0))
    const filled = Math.round((val / total) * length)
    const empty = Math.max(0, length - filled)
    const succ = t?.success || '\x1b[32m'
    const inact = t?.borderInactive || t?.dim || '\x1b[90m'
    return `${succ}${'█'.repeat(filled)}${inact}${'░'.repeat(empty)}\x1b[0m`
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BOX DRAWING PRIMITIVE
  // Generates an array of exactly 'h' lines, each with visual length 'w'
  // ───────────────────────────────────────────────────────────────────────────

  buildBox(title, linesContent, w, h, isFocused, t) {
    const bColor = isFocused ? t.borderActive : t.borderInactive
    const tStyle = isFocused ? t.titleActive : t.titleInactive
    const result = []

    // 1. Top border with title
    const plainTitle = ` ${stripAnsi(title)} `
    const titleVis = plainTitle.length
    const maxTitleVis = Math.max(0, w - 6)
    const safeTitle = titleVis > maxTitleVis ? plainTitle.slice(0, maxTitleVis - 1) + '… ' : plainTitle
    const safeTitleVis = safeTitle.length
    const remDashes = Math.max(0, w - 3 - safeTitleVis)
    
    const topLine = `${bColor}┌─\x1b[0m${tStyle}${safeTitle}\x1b[0m${bColor}${'─'.repeat(remDashes)}┐\x1b[0m`
    result.push(topLine)

    // 2. Middle lines
    const innerH = h - 2
    const innerW = w - 4 // w - 2 for borders, - 2 for inner margin spaces

    for (let i = 0; i < innerH; i++) {
      const rawText = linesContent[i] || ''
      const padded = fitAnsi(rawText, innerW)
      result.push(`${bColor}│\x1b[0m ${padded} ${bColor}│\x1b[0m`)
    }

    // 3. Bottom border
    const botLine = `${bColor}└${'─'.repeat(Math.max(0, w - 2))}┘\x1b[0m`
    result.push(botLine)

    return result
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PANE CONTENT BUILDERS
  // ───────────────────────────────────────────────────────────────────────────

  getPane1Content(job, innerW, innerH, t) {
    const c = []
    const timePct = Number.isFinite(job.time_progress_pct) ? job.time_progress_pct : null
    const goalPct = Number.isFinite(job.goals_progress_pct) ? job.goals_progress_pct : null
    c.push(`Status:   ${job.runtime_live ? t.success : t.warning}${job.status || 'NO RUNTIME EVIDENCE'}\x1b[0m`)
    c.push(`Job ID:   ${t.accent}${job.job_id || job.id || 'N/D'}\x1b[0m`)
    c.push(`Titolo:   ${t.cyan}${job.title || 'N/D'}\x1b[0m`)
    c.push(timePct === null ? `Tempo:    N/D (no live runtime evidence)` : `Tempo:    [${this.renderBar(timePct, 100, Math.min(14, innerW - 22), t)}] ${timePct.toFixed(1)}%`)
    c.push(goalPct === null ? `Goals:    N/D (no live runtime evidence)` : `Goals:    [${this.renderBar(goalPct, 100, Math.min(14, innerW - 22), t)}] ${goalPct.toFixed(1)}%`)
    c.push(`Runtime:  ${job.runtime_live ? t.success + 'LIVE' : t.warning + 'REGISTRY/STALE'}\x1b[0m | Source: ${t.dim}${job.source || 'N/D'}\x1b[0m`)
    c.push(`──────────────────────────────────────────────────────────`)

    const logs = job.live_agent_logs || []
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i]
      c.push(`[${l.timestamp}] ${t.magenta}${l.agent_id}\x1b[0m: ${l.action} ➔ ${t.success}${l.ledger_entry?.[0] || 'LED'}\x1b[0m`)
    }
    return c
  }

  getPane2Content(job, innerW, innerH, t) {
    const c = this.getPane1Content(job, innerW, innerH, t)
    c.push(`──────────────────────────────────────────────────────────`)
    c.push(`Recurrence: ${job.recurrence || 'N/D'} | Runs recorded: ${job.runs_completed ?? 'N/D'}`)
    c.push(`Last artifact: ${job.last_run_artifact || 'N/D'}`)
    return c
  }

  getPane3Content(job, innerW, innerH, t) {
    const c = []
    const ledger = this.state.metrics?.immutable_ledger || {}
    const entries = ledger.recent_ledger_entries || []
    c.push(`Ledger source: ${t.cyan}${ledger.source || 'N/D'}\x1b[0m`)
    c.push(`Stored records: ${t.success}${ledger.total_executions_recorded || 0}\x1b[0m`)
    c.push(`Crypto verification: ${ledger.cryptographic_verification_performed ? t.success + 'PERFORMED' : t.warning + 'NOT PERFORMED'}\x1b[0m`)
    c.push(`Recorded PERFECT_MATCH rate: ${ledger.recorded_perfect_match_claim_rate_pct ?? 'N/D'}%`)
    c.push(`Legacy pseudo-signature rows: ${ledger.legacy_pseudo_signature_records ?? 0}`)
    c.push(`──────────────────────────────────────────────────────────`)
    entries.slice(0, 6).forEach(entry => c.push(`${t.accent}${entry.entry_id}\x1b[0m | ${entry.actor_agent_id || 'N/D'} | ${entry.match_status || 'N/D'}`))
    return c
  }

  getPane4Content(job, innerW, innerH, t) {
    const c = []
    const ports = this.state.metrics?.ports_probe || []
    ports.slice(0, 7).forEach(port => c.push(`${String(port.name).slice(0, 32).padEnd(32)} [ ${port.status === 'ONLINE' ? t.success : t.warning}${port.status}\x1b[0m ] :${port.port}`))
    c.push(`──────────────────────────────────────────────────────────`)
    const hw = this.state.metrics?.hardware || {}
    c.push(`Hardware: ${t.cyan}CPU ${hw.cpu_percent ?? 'N/D'}% | RAM ${hw.used_ram_gb ?? 'N/D'}/${hw.total_ram_gb ?? 'N/D'} GB\x1b[0m`)
    c.push(`Sensor: ${hw.sensor_source || 'unavailable'}`)
    return c
  }

  getZoomedContent(paneIdx, j1, j2, innerW, innerH, t) {
    if (paneIdx === 2) return this.getPane3Content(j1, innerW, innerH, t)
    if (paneIdx === 3) return this.getPane4Content(j2, innerW, innerH, t)
    const job = paneIdx === 0 ? j1 : j2
    const c = this.getPane1Content(job, innerW, innerH, t)
    c.push(`──────────────────────────────────────────────────────────────────────────────────────────`)
    c.push(`Project: ${job.project_name || job.project_id || 'N/D'}`)
    c.push(`Start: ${job.start_time_local || 'N/D'} | Scheduled end: ${job.scheduled_end_time_local || 'N/D'}`)
    c.push(`Current agent: ${job.current_active_agent || 'N/D'} | Model: ${job.current_model || 'N/D'}`)
    c.push(`Evidence age: ${job.evidence_age_seconds ?? 'N/D'} seconds`)
    const logs = job.live_agent_logs || []
    c.push(`Recorded log entries: ${logs.length}`)
    logs.slice(0, 10).forEach(log => c.push(`[${log.timestamp || 'N/D'}] ${log.agent_id || 'N/D'}: ${log.action || 'N/D'}`))
    return c
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FULL-SCREEN RENDER
  // ───────────────────────────────────────────────────────────────────────────

  render() {
    const width = Math.max(80, process.stdout.columns || 120)
    const height = Math.max(24, process.stdout.rows || 30)
    const t = getTheme()
    const jobs = this.state.jobs || []
    const j1 = jobs[0] || {}
    const j2 = jobs[1] || {}

    let buf = '\x1b[H' // Home cursor

    // 1. Top Header Bar (1 line)
    const modeBadge = this.zoomed ? `\x1b[43m\x1b[30m\x1b[1m ZOOMED: PANE ${this.focusedPane + 1} \x1b[0m` : `\x1b[42m\x1b[30m\x1b[1m WM MODE \x1b[0m`
    const headerTitle = ` TUIOS · TERMINAL UI OPERATING SYSTEM · MULTIPLEXER `
    const rightInfo = `${t.accent}${t.name}\x1b[0m | ${new Date().toLocaleTimeString()} `
    const headerLeft = ` ${modeBadge} ${t.dockFg}${headerTitle}`
    const headerPad = Math.max(0, width - visibleLength(headerLeft) - visibleLength(rightInfo))
    buf += `${t.dockBg}${headerLeft}${' '.repeat(headerPad)}${rightInfo}\x1b[0m\n`

    // Available height for panes
    const mainHeight = height - 2 // minus top header (1 line) and dockbar (1 line)

    if (this.zoomed) {
      // Single Zoomed Pane
      const titles = [
        `⏳ PANE 1: ${j1.job_id || j1.id || 'NO JOB EVIDENCE'}`,
        `🚀 PANE 2: ${j2.job_id || j2.id || 'NO SECOND JOB'}`,
        `🔒 PANE 3: STORED LEDGER RECORDS`,
        `⚡ PANE 4: RUNTIME PORT PROBES`
      ]
      const zoomedContent = this.getZoomedContent(this.focusedPane, j1, j2, width - 4, mainHeight - 2, t)
      const boxLines = this.buildBox(titles[this.focusedPane], zoomedContent, width, mainHeight, true, t)
      buf += boxLines.join('\n') + '\n'

    } else if (this.layout === 'dual_v') {
      // Dual Vertical Split (50/50)
      const leftW = Math.floor(width / 2)
      const rightW = width - leftW

      const p1Content = this.getPane1Content(j1, leftW - 4, mainHeight - 2, t)
      const p2Content = this.getPane2Content(j2, rightW - 4, mainHeight - 2, t)

      const leftLines = this.buildBox(`⏳ PANE 1: ${j1.job_id || j1.id || 'N/D'}`, p1Content, leftW, mainHeight, this.focusedPane === 0, t)
      const rightLines = this.buildBox(`🚀 PANE 2: ${j2.job_id || j2.id || 'N/D'}`, p2Content, rightW, mainHeight, this.focusedPane === 1, t)

      for (let r = 0; r < mainHeight; r++) {
        buf += (leftLines[r] || '') + (rightLines[r] || '') + '\n'
      }

    } else if (this.layout === 'dual_h') {
      // Dual Horizontal Split
      const topH = Math.floor(mainHeight / 2)
      const botH = mainHeight - topH

      const p1Content = this.getPane1Content(j1, width - 4, topH - 2, t)
      const p2Content = this.getPane2Content(j2, width - 4, botH - 2, t)

      const topLines = this.buildBox(`⏳ PANE 1: ${j1.job_id || j1.id || 'N/D'}`, p1Content, width, topH, this.focusedPane === 0, t)
      const botLines = this.buildBox(`🚀 PANE 2: ${j2.job_id || j2.id || 'N/D'}`, p2Content, width, botH, this.focusedPane === 1, t)

      buf += topLines.join('\n') + '\n' + botLines.join('\n') + '\n'

    } else {
      // BSP Quad Matrix (4 Panes filling 100% of terminal height & width)
      const topH = Math.floor(mainHeight / 2)
      const botH = mainHeight - topH
      const leftW = Math.floor(width / 2)
      const rightW = width - leftW

      const p1Content = this.getPane1Content(j1, leftW - 4, topH - 2, t)
      const p2Content = this.getPane2Content(j2, rightW - 4, topH - 2, t)
      const p3Content = this.getPane3Content(j1, leftW - 4, botH - 2, t)
      const p4Content = this.getPane4Content(j2, rightW - 4, botH - 2, t)

      const p1Lines = this.buildBox(`⏳ PANE 1: ${j1.job_id || j1.id || 'N/D'}`, p1Content, leftW, topH, this.focusedPane === 0, t)
      const p2Lines = this.buildBox(`🚀 PANE 2: ${j2.job_id || j2.id || 'N/D'}`, p2Content, rightW, topH, this.focusedPane === 1, t)
      const p3Lines = this.buildBox(`🔒 PANE 3: STORED LEDGER RECORDS`, p3Content, leftW, botH, this.focusedPane === 2, t)
      const p4Lines = this.buildBox(`⚡ PANE 4: PORTS & RUNTIME PROTOCOL`, p4Content, rightW, botH, this.focusedPane === 3, t)

      for (let r = 0; r < topH; r++) {
        buf += (p1Lines[r] || '') + (p2Lines[r] || '') + '\n'
      }
      for (let r = 0; r < botH; r++) {
        buf += (p3Lines[r] || '') + (p4Lines[r] || '') + '\n'
      }
    }

    // Modal Overlays
    if (this.showPalette) {
      buf = this.renderPaletteOverlay(buf, width, height, t)
    } else if (this.showHelp) {
      buf = this.renderHelpOverlay(buf, width, height, t)
    }

    // Bottom Dockbar (1 line)
    const wsPills = [1, 2, 3, 4, 5].map(w => {
      const isCur = this.currentWorkspace === w
      const label = w === 1 ? '1: Matrix' : w === 2 ? '2: 10H Audit' : w === 3 ? '3: B2B Swarm' : w === 4 ? '4: Ledger' : '5: Shell'
      return isCur ? `${t.dockActive} ${label} \x1b[0m` : `${t.dockPill} ${label} \x1b[0m`
    }).join(' ')

    const dockRight = ` [Tab] Focus | [z/Enter] Zoom | [Space] Layout | [p] Palette | [t] Theme | [q] Exit `
    const dockLeft = ` ${wsPills} `
    const dockPad = Math.max(0, width - visibleLength(dockLeft) - visibleLength(dockRight))
    buf += `${t.dockBg}${dockLeft}${' '.repeat(dockPad)}${t.dockFg}${dockRight}\x1b[0m`

    process.stdout.write(buf)
  }

  renderPaletteOverlay(buf, w, h, t) {
    const modalW = Math.min(70, w - 6)
    const actions = this.getFilteredPaletteActions()
    const modalH = Math.min(14, actions.length + 5)
    const startX = Math.floor((w - modalW) / 2)
    const startY = Math.floor((h - modalH) / 2)

    const lines = buf.split('\n')
    const modalLines = []

    const topTitle = ` COMMAND PALETTE (Ctrl+P) `
    modalLines.push(`${t.accent}╔═ ${t.titleActive}${topTitle}\x1b[0m${t.accent}${'═'.repeat(Math.max(0, modalW - 4 - topTitle.length))}╗\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m > ${t.cyan}${this.paletteSearch}\x1b[0m${'_'.repeat(Math.max(0, modalW - 6 - this.paletteSearch.length))} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}╠${'═'.repeat(Math.max(0, modalW - 2))}╣\x1b[0m`)

    for (let i = 0; i < Math.min(actions.length, modalH - 5); i++) {
      const act = actions[i]
      const isSel = i === this.paletteSelected
      const prefix = isSel ? ` ▶ \x1b[1m` : `   `
      const lineStr = `${prefix}${act.name}`
      const padded = fitAnsi(lineStr, modalW - 4)
      modalLines.push(`${t.accent}║\x1b[0m ${isSel ? t.titleActive : ''}${padded}\x1b[0m ${t.accent}║\x1b[0m`)
    }

    while (modalLines.length < modalH - 1) {
      modalLines.push(`${t.accent}║\x1b[0m ${' '.repeat(modalW - 4)} ${t.accent}║\x1b[0m`)
    }
    modalLines.push(`${t.accent}╚${'═'.repeat(Math.max(0, modalW - 2))}╝\x1b[0m`)

    for (let i = 0; i < modalLines.length; i++) {
      const lineIdx = startY + i
      if (lines[lineIdx] !== undefined) {
        lines[lineIdx] = modalLines[i]
      }
    }
    return lines.join('\n')
  }

  renderHelpOverlay(buf, w, h, t) {
    const modalW = Math.min(68, w - 6)
    const modalH = 14
    const startX = Math.floor((w - modalW) / 2)
    const startY = Math.floor((h - modalH) / 2)

    const lines = buf.split('\n')
    const modalLines = []

    modalLines.push(`${t.accent}╔═ ${t.titleActive} TUIOS KEYBOARD SHORTCUTS \x1b[0m${t.accent}${'═'.repeat(Math.max(0, modalW - 30))}╗\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m ${fitAnsi(`${t.accent}Tab / Shift+Tab\x1b[0m : Focus next / previous window pane`, modalW - 4)} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m ${fitAnsi(`${t.accent}h / j / k / l\x1b[0m   : Directional window focus (Left/Down/Up/Right)`, modalW - 4)} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m ${fitAnsi(`${t.accent}z / Enter\x1b[0m       : Toggle Zoom / Fullscreen on active pane`, modalW - 4)} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m ${fitAnsi(`${t.accent}Space\x1b[0m           : Cycle layout (Quad BSP, Dual Vert, Dual Horiz)`, modalW - 4)} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m ${fitAnsi(`${t.accent}1 - 5\x1b[0m           : Switch virtual workspace (Matrix, Audit, B2B, Ledger, Shell)`, modalW - 4)} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m ${fitAnsi(`${t.accent}Ctrl+P / p\x1b[0m      : Open Command Palette with fuzzy search`, modalW - 4)} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m ${fitAnsi(`${t.accent}t\x1b[0m               : Cycle Color Themes (TokyoNight, Dracula, Nord, ...)`, modalW - 4)} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m ${fitAnsi(`${t.accent}?\x1b[0m               : Toggle this help guide`, modalW - 4)} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}║\x1b[0m ${fitAnsi(`${t.accent}q / Esc\x1b[0m         : Clean exit back to terminal`, modalW - 4)} ${t.accent}║\x1b[0m`)
    modalLines.push(`${t.accent}╚${'═'.repeat(Math.max(0, modalW - 2))}╝\x1b[0m`)

    for (let i = 0; i < modalLines.length; i++) {
      const lineIdx = startY + i
      if (lines[lineIdx] !== undefined) {
        lines[lineIdx] = modalLines[i]
      }
    }
    return lines.join('\n')
  }
}

function launchTuiosMultiplexer(onExitCallback) {
  const engine = new TuiosEngine(onExitCallback)
  engine.start()
}

function runSelfTest() {
  const engine = Object.create(TuiosEngine.prototype)
  engine.focusedPane = 0
  engine.zoomed = false
  engine.currentWorkspace = 1
  engine.layout = 'quad'
  engine.showPalette = false
  engine.showHelp = false
  engine.paletteSearch = ''
  engine.paletteSelected = 0
  engine.render = () => {}
  const theme = THEMES.tokyonight
  const box = engine.buildBox('SELF TEST', ['one', 'two'], 32, 6, true, theme)
  const checks = {
    box_height: box.length === 6,
    box_width: box.every(line => visibleLength(line) === 32),
    palette: engine.getFilteredPaletteActions().length >= 8,
  }
  engine.handleKeypress(' ', { name: 'space' })
  checks.layout_cycle = engine.layout === 'dual_v'
  engine.handleKeypress('z', { name: 'z' })
  checks.zoom_toggle = engine.zoomed === true
  engine.handleKeypress('', { name: 'tab', shift: false })
  checks.focus_cycle = engine.focusedPane === 1
  return { ok: Object.values(checks).every(Boolean), checks }
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    const result = runSelfTest()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exit(result.ok ? 0 : 2)
  } else {
    launchTuiosMultiplexer(() => {
      process.exit(0)
    })
  }
}

module.exports = {
  TuiosEngine,
  launchTuiosMultiplexer,
  runSelfTest,
}
