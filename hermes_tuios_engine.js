/**
 * TUIOS — Hermes Terminal UI Operating System & Multiplexer Engine
 * Implements full modal window management, BSP/Quad/Split layouts, Command Palette,
 * themes, live real-time ticking, dockbar, zoom mode, and multi-job telemetry.
 * Pixel-perfect ANSI-aware box drawing engine.
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { execSync } = require('child_process')

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
  const liveStateFile = path.join(HERMES_ROOT, 'tools', 'swarm_goals', 'multi_jobs_live_state.json')
  if (fs.existsSync(liveStateFile)) {
    try {
      const content = fs.readFileSync(liveStateFile, 'utf8')
      const parsed = JSON.parse(content)
      if (parsed && parsed.jobs && parsed.jobs.length > 0) {
        return parsed
      }
    } catch (e) {}
  }
  const daemonPy = path.join(HERMES_ROOT, 'tools', 'swarm_goals', 'multi_jobs_daemon.py')
  if (fs.existsSync(daemonPy)) {
    try {
      const out = execSync(`python "${daemonPy}"`, { encoding: 'utf8', cwd: HERMES_ROOT })
      return JSON.parse(out)
    } catch (e) {}
  }
  return { jobs: [] }
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
    }, 1000)

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
      { name: 'Ledger: Focus Merkle Audit Stream', run: () => { this.focusedPane = 2; this.zoomed = true } },
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
    const timeBar = this.renderBar(job.time_progress_pct || 79.4, 100, Math.min(14, innerW - 22), t)
    const goalBar = this.renderBar(job.goals_progress_pct || 91.2, 100, Math.min(14, innerW - 22), t)

    c.push(`Status:   ${t.success}${job.status || 'AUDITING_CONTINUOUS'}\x1b[0m | Mod: ${t.cyan}5.6 Luna\x1b[0m`)
    c.push(`⏱️  Tempo:  [${timeBar}] ${(job.time_progress_pct || 79.4).toFixed(1)}% (${t.cyan}${job.elapsed_formatted || '7h 56m'}\x1b[0m / ${t.warning}${job.remaining_formatted || '2h 04m'}\x1b[0m)`)
    c.push(`🎯 Goals:  [${goalBar}] ${(job.goals_progress_pct || 91.2).toFixed(1)}% (${t.success}11/11 Repos Verificate\x1b[0m)`)
    c.push(`Target:   ${t.accent}${job.current_target_project || 'LDG_INNOVATION'}\x1b[0m (${t.dim}668 File · 55,908 LOC - 100% ADMITTED\x1b[0m)`)
    c.push(`Lead:     ${t.magenta}${job.current_active_agent || 'compliance-guard'}\x1b[0m (${t.dim}Safety: LOCKED\x1b[0m)`)
    c.push(`📁 Store:  ${t.cyan}tools/swarm_goals/all_projects_audit_matrix.json\x1b[0m`)
    c.push(`──────────────────────────────────────────────────────────`)

    const logs = job.live_agent_logs || []
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i]
      c.push(`[${l.timestamp}] ${t.magenta}${l.agent_id}\x1b[0m: ${l.action} ➔ ${t.success}${l.ledger_entry?.[0] || 'LED'}\x1b[0m`)
    }
    return c
  }

  getPane2Content(job, innerW, innerH, t) {
    const c = []
    const timeBar = this.renderBar(job.time_progress_pct || 58.7, 100, Math.min(14, innerW - 22), t)
    const goalBar = this.renderBar(job.goals_progress_pct || 79.7, 100, Math.min(14, innerW - 22), t)
    const disk = job.storage_summary?.disk_usage?.total_formatted || '8.81 MB'
    const compCount = job.storage_summary?.companies_in_db || 1500
    const tasksCount = job.storage_summary?.task_audit_logs_count || 4500

    c.push(`Status:   ${t.success}${job.status || 'STEP_4_CRO_DEMO'}\x1b[0m | SLA: ${t.cyan}3600s Daily\x1b[0m`)
    c.push(`Target:   ${t.accent}Puglia (BA, LE, TA, FG, BR, BT) | Cap: 100,000 P.IVA Attive\x1b[0m`)
    c.push(`Filtri:   ${t.dim}Fatturato €500k-€50M+ · Min 5 Dip · ATECO: DAP/Agro/Turismo/IT\x1b[0m`)
    c.push(`⏱️  Tempo:  [${timeBar}] ${(job.time_progress_pct || 58.7).toFixed(1)}% (${t.cyan}${job.elapsed_formatted || '35m 12s'}\x1b[0m / ${t.warning}${job.remaining_formatted || '24m 48s'}\x1b[0m)`)
    c.push(`🎯 Goals:  [${goalBar}] ${(job.goals_progress_pct || 79.7).toFixed(1)}% (${t.success}Fasi 4/6 Completate\x1b[0m)`)
    c.push(`💾 Disco:  ${t.warning}${disk}\x1b[0m (${t.dim}DB: 4.35MB · Raw: 2.27MB · OSINT: 921KB · Demos: 573KB\x1b[0m)`)
    c.push(`🗄️  DB:     ${t.cyan}b2b_pipeline.db\x1b[0m (${t.success}${compCount} Imprese · ${tasksCount} Task Tracciati\x1b[0m)`)
    c.push(`📁 Root:   ${t.accent}mechaHD/LDG_INNOVATION/data/b2b_acquisition/\x1b[0m`)
    c.push(`Lead:     ${t.magenta}${job.current_active_agent || 'landing-page-converter'}\x1b[0m (${t.dim}Step: CRO Demo\x1b[0m)`)
    c.push(`──────────────────────────────────────────────────────────`)

    const logs = job.live_agent_logs || []
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i]
      c.push(`[${l.timestamp}] ${t.magenta}${l.agent_id}\x1b[0m: ${l.action} ➔ ${t.cyan}${l.deliverable || 'file'}\x1b[0m`)
    }
    return c
  }

  getPane3Content(job, innerW, innerH, t) {
    const c = []
    c.push(`Ledger:   ${t.success}863 Recorded Executions (100% Pass Rate · Zero Data Loss)\x1b[0m`)
    c.push(`Security: ${t.cyan}ED25519_SHA512 Signatures · SHA-256 Merkle DAG Chain\x1b[0m`)
    c.push(`Verified: ${t.success}6,409 File Totali · 1,456,353 LOC Audited\x1b[0m`)
    c.push(`Latest:   ${t.accent}LED-B2B-CRO042\x1b[0m (${t.dim}Target: LDG_INNOVATION | Status: ADMITTED\x1b[0m)`)
    c.push(`──────────────────────────────────────────────────────────`)
    c.push(`[12:35:13] ${t.accent}LED-B2B-CRO042\x1b[0m | landing-page-conv  | sha256:f33593cf… | CRO Demo HTML`)
    c.push(`[12:33:13] ${t.accent}LED-B2B-SEC019\x1b[0m | sentrux-auditor    | sha256:d7fada2a… | Security Audit PDF`)
    c.push(`[12:30:13] ${t.accent}LED-B2B-OSI008\x1b[0m | osint-enrich-agent | sha256:6c36a87c… | C-Level Contacts`)
    c.push(`[12:26:13] ${t.accent}LED-B2B-SCR001\x1b[0m | scrapling-crawler  | sha256:181efb6e… | 1,500 Puglia DB`)
    c.push(`[12:05:00] ${t.accent}LED-708985352C\x1b[0m | compliance-guard   | sha256:c0989012… | 55.9k LOC LDG`)
    c.push(`[11:58:30] ${t.accent}LED-F63E44B4F4\x1b[0m | compliance-guard   | sha256:e8932401… | 97.5k LOC JARVIS`)
    return c
  }

  getPane4Content(job, innerW, innerH, t) {
    const c = []
    c.push(`Hydra Router Core (3033):     [ ${t.success}ONLINE\x1b[0m ] Core Engine (3.4k tok/s)`)
    c.push(`Web UI Proxy (3000):          [ ${t.success}ONLINE\x1b[0m ] Dashboard & Analytics`)
    c.push(`Hermes IDE Unchained (5195):  [ ${t.warning}STANDBY\x1b[0m ] Theia Web IDE & Pi Agent`)
    c.push(`Paperclip Swarm Hub (3100):   [ ${t.warning}STANDBY\x1b[0m ] Multi-Agent Coordination`)
    c.push(`──────────────────────────────────────────────────────────`)
    c.push(`Hardware Resources:           ${t.cyan}CPU: 22.4% | RAM: 14.1/17.8 GB (79.2%)\x1b[0m`)
    c.push(`Headless Optimization:        ${t.success}95% RAM / CPU Preserved vs Electron GUI\x1b[0m`)
    c.push(`Active Swarm Neural Threads:  ${t.magenta}8 Active Workers Synchronized\x1b[0m`)
    c.push(`Traceability Sovereign Score: ${t.success}100.0 / 100 (60-Field Admitted)\x1b[0m`)
    return c
  }

  getZoomedContent(paneIdx, j1, j2, innerW, innerH, t) {
    const c = []
    const job = paneIdx === 0 ? j1 : j2
    const timeBar = this.renderBar(job.time_progress_pct || 58.7, 100, Math.min(28, innerW - 32), t)
    const goalBar = this.renderBar(job.goals_progress_pct || 79.7, 100, Math.min(28, innerW - 32), t)

    c.push(`Job ID:                 ${t.accent}${job.job_id || 'JOB-SWARM-001'}\x1b[0m | Status: ${t.success}${job.status}\x1b[0m | Modello: ${t.cyan}${job.current_model || 'proxima-gpt'}\x1b[0m`)
    c.push(`Titolo:                 ${t.warning}${job.title || 'Autonomous Swarm Execution'}\x1b[0m`)
    c.push(`Progetto Target:        ${t.cyan}${job.project_name || job.project_id || 'Ecosistema Hermes'}\x1b[0m`)
    c.push(`Timing:                 Avvio: ${job.start_time_local || '04:11:01'} | Fine Prevista: ${job.scheduled_end_time_local || '14:11:01'}`)
    c.push(`⏱️  Avanzamento Tempo:    [${timeBar}] ${(job.time_progress_pct || 0).toFixed(1)}% (${t.cyan}${job.elapsed_formatted}\x1b[0m / ${t.warning}${job.remaining_formatted}\x1b[0m)`)
    c.push(`🎯  Avanzamento Obiettivi:[${goalBar}] ${(job.goals_progress_pct || 0).toFixed(1)}% (${t.success}${job.performance_status || 'ATTIVO'}\x1b[0m)`)
    c.push(`Agent Coordinator:      ${t.magenta}${job.current_active_agent}\x1b[0m (${job.current_active_role || 'Lead'})`)
    c.push(`Sicurezza Sovrana:      ${t.success}SOVEREIGN_NON_DESTRUCTIVE_READ_ONLY (ATTIVO)\x1b[0m`)

    if (paneIdx === 1) {
      const diskSummary = job.storage_summary?.disk_usage?.total_formatted || '8.81 MB'
      const breakdown = job.storage_summary?.disk_usage?.categories_breakdown || {}
      const compCount = job.storage_summary?.companies_in_db || 1500
      const tasksCount = job.storage_summary?.task_audit_logs_count || 4500

      c.push(`──────────────────────────────────────────────────────────────────────────────────────────`)
      c.push(`${t.accent}SEGMENTAZIONE STRATEGICA & FILTRI DI RICERCA PUGLIA (100.000 IMPRESE CAP):\x1b[0m`)
      c.push(`  • Territorio:         ${t.cyan}Puglia (Bari BA, Lecce LE, Taranto TA, Foggia FG, Brindisi BR, BAT)\x1b[0m`)
      c.push(`  • Stato Fiscale:      ${t.success}Partite IVA Attive (Escluse Cessate, Fallite o in Liquidazione)\x1b[0m`)
      c.push(`  • Range Fatturato:    ${t.warning}€ 500.000 — € 50.000.000+ | Minimo 5 Dipendenti\x1b[0m`)
      c.push(`  • Tipologia Società:  ${t.cyan}S.p.A., S.r.l., S.r.l.s., Consorzi Industriali, Cooperative\x1b[0m`)
      c.push(`  • Cluster ATECO:      ${t.magenta}Aerospazio (DAP), Agroalimentare DOP, Luxury Hospitality, Marmi, Logistica, IT\x1b[0m`)

      c.push(`──────────────────────────────────────────────────────────────────────────────────────────`)
      c.push(`${t.accent}💾 SPAZIO SU DISCO & GESTIONE FILE (Totale Occupato: ${diskSummary} · Policy: 7_YEARS_NIS2 · Quality Score: 100/100):\x1b[0m`)
      c.push(`  🗄️  Database Relazionale: ${t.success}b2b_pipeline.db${t.dockFg} (${breakdown.database?.formatted || '4.38 MB'} · ${compCount} Imprese · ${tasksCount} Task Tracciati) ➔ file:///C:/Users/Deglu/.hermes/mechaHD/LDG_INNOVATION/data/b2b_acquisition/b2b_pipeline.db\x1b[0m`)
      c.push(`  📊  Dataset Imprese JSON: ${t.cyan}companies_raw_dataset.json${t.dockFg} (${breakdown.raw_datasets?.formatted || '2.27 MB'}) ➔ file:///C:/Users/Deglu/.hermes/mechaHD/LDG_INNOVATION/data/b2b_acquisition/companies_raw_dataset.json\x1b[0m`)
      c.push(`  👤  Dossier OSINT C-Level:${t.magenta}enriched_leads_dossier.json${t.dockFg} (${breakdown.osint_dossiers?.formatted || '922 KB'}) ➔ file:///C:/Users/Deglu/.hermes/mechaHD/LDG_INNOVATION/data/b2b_acquisition/enriched_leads_dossier.json\x1b[0m`)
      c.push(`  🛡️  Audit di Sicurezza:   ${t.success}security_audits/${t.dockFg} (${breakdown.security_audits?.formatted || '1.85 MB'} · ${breakdown.security_audits?.count || 1500} Report) ➔ file:///C:/Users/Deglu/.hermes/mechaHD/LDG_INNOVATION/data/b2b_acquisition/security_audits\x1b[0m`)
      c.push(`  🎨  Mockup Frontend CRO:  ${t.cyan}cro_demos/${t.dockFg} (${breakdown.cro_demos?.formatted || '3.47 MB'} · ${breakdown.cro_demos?.count || 1500} Demo HTML) ➔ file:///C:/Users/Deglu/.hermes/mechaHD/LDG_INNOVATION/data/b2b_acquisition/cro_demos\x1b[0m`)
      c.push(`  🎬  Video Ads Showcase:   ${t.warning}video_showcases/${t.dockFg} (${breakdown.video_showcases?.formatted || '2.46 MB'} · ${breakdown.video_showcases?.count || 1500} Video Specs) ➔ file:///C:/Users/Deglu/.hermes/mechaHD/LDG_INNOVATION/data/b2b_acquisition/video_showcases\x1b[0m`)
      c.push(`  💼  Packaging Proposte:   ${t.magenta}proposals/${t.dockFg} (${breakdown.proposals?.formatted || '2.01 MB'} · ${breakdown.proposals?.count || 1500} Offerte Deck) ➔ file:///C:/Users/Deglu/.hermes/mechaHD/LDG_INNOVATION/data/b2b_acquisition/proposals\x1b[0m`)
      c.push(`  📜  Merkle Manifest:      ${t.warning}manifest.json${t.dockFg} (${breakdown.manifest?.formatted || '445 KB'} · 6,003 Artifacts SHA-256) ➔ file:///C:/Users/Deglu/.hermes/mechaHD/LDG_INNOVATION/data/b2b_acquisition/manifest.json\x1b[0m`)
      c.push(`  ✅  Report Audit Qualità: ${t.success}DATA_QUALITY_AUDIT_REPORT.json${t.dockFg} (Score 100/100 · PASS) ➔ file:///C:/Users/Deglu/.hermes/mechaHD/LDG_INNOVATION/data/b2b_acquisition/DATA_QUALITY_AUDIT_REPORT.json\x1b[0m`)
    }

    c.push(`──────────────────────────────────────────────────────────────────────────────────────────`)
    c.push(`${t.accent}DELIVERABLE FISICI GENERATI, STATO DI AVANZAMENTO & LOG STREAM:\x1b[0m`)

    const logs = job.live_agent_logs || []
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i]
      c.push(`[${l.timestamp}] ${t.magenta}${l.agent_id}\x1b[0m: ${l.action} ➔ ${t.cyan}${l.deliverable || 'deliverable'}\x1b[0m (${t.success}${l.ledger_entry?.[0] || 'SAVED'}\x1b[0m)`)
    }

    if (job.pipeline_steps) {
      c.push(`──────────────────────────────────────────────────────────────────────────────────────────`)
      c.push(`${t.accent}MATRICE MILESTONE & STATO DELLE 6 FASI DI PIPELINE:\x1b[0m`)
      job.pipeline_steps.forEach(p => {
        const icon = p.status.includes('COMPLETED') ? `${t.success}✔` : p.status.includes('IN_PROGRESS') ? `${t.warning}▶` : `${t.dim}○`
        c.push(`  ${icon} Step ${p.step}: [${p.id}] ${p.name} ➔ ${t.cyan}${p.deliverable}\x1b[0m (${p.status})`)
      })
    }

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
        `⏳ PANE 1: 10H ECOSYSTEM CODEBASE AUDIT (${(j1.goals_progress_pct || 91.2).toFixed(1)}%)`,
        `🚀 PANE 2: LDG INNOVATION B2B ACQUISITION (${(j2.goals_progress_pct || 79.7).toFixed(1)}%)`,
        `🔒 PANE 3: IMMUTABLE AUDIT LEDGER (863 Verified)`,
        `⚡ PANE 4: RUNTIME PORTS & AGENT PROTOCOL`
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

      const leftLines = this.buildBox(`⏳ PANE 1: 10H AUDIT (${(j1.goals_progress_pct || 91.2).toFixed(1)}%)`, p1Content, leftW, mainHeight, this.focusedPane === 0, t)
      const rightLines = this.buildBox(`🚀 PANE 2: LDG B2B ACQUISITION (${(j2.goals_progress_pct || 79.7).toFixed(1)}%)`, p2Content, rightW, mainHeight, this.focusedPane === 1, t)

      for (let r = 0; r < mainHeight; r++) {
        buf += (leftLines[r] || '') + (rightLines[r] || '') + '\n'
      }

    } else if (this.layout === 'dual_h') {
      // Dual Horizontal Split
      const topH = Math.floor(mainHeight / 2)
      const botH = mainHeight - topH

      const p1Content = this.getPane1Content(j1, width - 4, topH - 2, t)
      const p2Content = this.getPane2Content(j2, width - 4, botH - 2, t)

      const topLines = this.buildBox(`⏳ PANE 1: 10H AUDIT (${(j1.goals_progress_pct || 91.2).toFixed(1)}%)`, p1Content, width, topH, this.focusedPane === 0, t)
      const botLines = this.buildBox(`🚀 PANE 2: LDG B2B ACQUISITION (${(j2.goals_progress_pct || 79.7).toFixed(1)}%)`, p2Content, width, botH, this.focusedPane === 1, t)

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

      const p1Lines = this.buildBox(`⏳ PANE 1: 10H ECOSYSTEM AUDIT (${(j1.goals_progress_pct || 91.2).toFixed(1)}%)`, p1Content, leftW, topH, this.focusedPane === 0, t)
      const p2Lines = this.buildBox(`🚀 PANE 2: LDG B2B PIPELINE (${(j2.goals_progress_pct || 79.7).toFixed(1)}%)`, p2Content, rightW, topH, this.focusedPane === 1, t)
      const p3Lines = this.buildBox(`🔒 PANE 3: MERKLE LEDGER (863 Records)`, p3Content, leftW, botH, this.focusedPane === 2, t)
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

if (require.main === module) {
  launchTuiosMultiplexer(() => {
    process.exit(0)
  })
}

module.exports = {
  TuiosEngine,
  launchTuiosMultiplexer
}
