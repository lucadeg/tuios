#!/usr/bin/env python3
"""Evidence-backed telemetry bridge for the Hermes TUIOS surfaces.

Filesystem declarations and historical database rows are reported as such. They
are never promoted to runtime, cryptographic, compliance, or quality evidence.
"""

import os
import sys
import json
import sqlite3
import socket
import glob
import re
import shutil
import time
import ctypes
try:
    import psutil
except ImportError:
    psutil = None
import subprocess
from datetime import datetime, timezone

HERMES_ROOT = os.path.abspath(os.environ.get("HERMES_ROOT") or os.path.join(os.path.dirname(__file__), "..", ".."))
STATE_DB = os.path.join(HERMES_ROOT, "state.db")
PROJECTS_DB = os.path.join(HERMES_ROOT, "projects.db")
KANBAN_DB = os.path.join(HERMES_ROOT, "kanban.db")
GITHUB_CATALOG_DB = os.path.join(HERMES_ROOT, "github-master-catalog.db")
RESPONSE_STORE_DB = os.path.join(HERMES_ROOT, "response_store.db")
BUZZ_STATE = os.path.join(HERMES_ROOT, "tools", "buzz", "buzz_state.json")
CATALOG_CACHE = os.path.join(HERMES_ROOT, "tools", "agent-bibliotecario", "catalog_cache.json")
AUTH_JSON = os.path.join(HERMES_ROOT, "auth.json")
PORT_REGISTRY = os.path.join(HERMES_ROOT, "port_registry.json")
CODEBASE_KNOWLEDGE = os.path.join(HERMES_ROOT, "CODEBASE_KNOWLEDGE.json")
HERMES_AGENT_DIR = os.path.join(HERMES_ROOT, "hermes-agent")

def get_file_size_mb(path):
    if os.path.exists(path):
        return round(os.path.getsize(path) / (1024 * 1024), 2)
    return 0.0

# ─────────────────────────────────────────────────────────────────────────────
# 1. REGISTERED PERSONA INVENTORY & OBSERVED AGENT DEFINITIONS
# ─────────────────────────────────────────────────────────────────────────────

def extract_registered_agent_personas():
    seed_files = [
        os.path.join(HERMES_ROOT, "seed_all_9_enterprise_divisions.js"),
        os.path.join(HERMES_ROOT, "seed_pure_it_enterprise_roster.js"),
        os.path.join(HERMES_ROOT, "seed_50_matrix_organization.js"),
        os.path.join(HERMES_ROOT, "seed_matrix_company.js")
    ]
    
    agents_map = {}
    division_counts = {
        "Executive & Board": 0,
        "Engineering & IT Infrastructure": 0,
        "Security, AppSec & Pentesting": 0,
        "Legal, Compliance & GDPR/NIS2": 0,
        "AI Research & Multi-Agent Swarm": 0,
        "Growth, Marketing & UGC Studio": 0,
        "Product & Cupertino UX Design": 0,
        "Finance, Treasury & FinOps": 0,
        "Operations & Logistics": 0
    }

    for sf in seed_files:
        if not os.path.exists(sf):
            continue
        try:
            with open(sf, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            # Regex parser for Javascript agent objects
            blocks = re.split(r'\{\s*name:\s*', content)
            for b in blocks[1:]:
                name_m = re.match(r'["\']([^"\']+)["\']', b)
                role_m = re.search(r'role:\s*["\']([^"\']+)["\']', b)
                title_m = re.search(r'title:\s*["\']([^"\']+)["\']', b)
                div_m = re.search(r'division:\s*["\']([^"\']+)["\']', b)
                skills_m = re.search(r'skills:\s*\[(.*?)\]', b, re.DOTALL)
                reports_m = re.search(r'reportsTo:\s*["\']?([^"\'\n,]+)["\']?', b)

                if name_m:
                    name = name_m.group(1)
                    role = role_m.group(1) if role_m else "agent"
                    title = title_m.group(1) if title_m else name
                    div = div_m.group(1) if div_m else None
                    skills = [s.strip().replace('"', '').replace("'", '') for s in skills_m.group(1).split(',')] if skills_m else []
                    reports = reports_m.group(1).strip() if reports_m and reports_m.group(1) != 'null' else "LDG Admin"

                    # Categorize Division automatically if not explicit
                    if not div:
                        lower = (name + " " + title + " " + role).lower()
                        if any(k in lower for k in ["ceo", "board", "investor", "direzione", "staff", "m&a"]):
                            div = "Executive & Board"
                        elif any(k in lower for k in ["security", "pentest", "ciso", "sentrux", "hexstrike", "leak", "redteam", "owasp"]):
                            div = "Security, AppSec & Pentesting"
                        elif any(k in lower for k in ["legal", "compliance", "gdpr", "nis2", "dpo", "traceability", "guard"]):
                            div = "Legal, Compliance & GDPR/NIS2"
                        elif any(k in lower for k in ["ai", "swarm", "bibliotecario", "pi", "kimi", "research", "ml"]):
                            div = "AI Research & Multi-Agent Swarm"
                        elif any(k in lower for k in ["growth", "marketing", "viral", "ugc", "higgsfield", "brand", "copy"]):
                            div = "Growth, Marketing & UGC Studio"
                        elif any(k in lower for k in ["product", "ux", "apple", "design", "markdoc", "front", "3d"]):
                            div = "Product & Cupertino UX Design"
                        elif any(k in lower for k in ["finance", "cfo", "treasury", "finops", "stripe", "billing"]):
                            div = "Finance, Treasury & FinOps"
                        elif any(k in lower for k in ["operations", "logistics", "estate", "paperless", "sync"]):
                            div = "Operations & Logistics"
                        else:
                            div = "Engineering & IT Infrastructure"

                    agent_id = name.lower().replace(' ', '-').replace('&', '').replace('/', '-').replace('(', '').replace(')', '')
                    if agent_id not in agents_map:
                        agents_map[agent_id] = {
                            "id": agent_id,
                            "name": name,
                            "title": title,
                            "role": role,
                            "division": div,
                            "skills_count": len(skills),
                            "skills": skills[:5],
                            "reports_to": reports,
                            "status": "registered_unverified"
                        }
        except Exception:
            pass

    for agent in agents_map.values():
        division = agent.get("division")
        if division not in division_counts:
            division = "Engineering & IT Infrastructure"
        division_counts[division] += 1

    detected_agent_definitions = 0
    try:
        with open(CATALOG_CACHE, "r", encoding="utf-8") as catalog_file:
            detected_agent_definitions = int(json.load(catalog_file).get("totals", {}).get("agent_definitions_count", 0) or 0)
    except Exception:
        pass

    return {
        "available": any(os.path.exists(item) for item in seed_files),
        "source": "seed persona declarations plus catalog filesystem scan",
        "total_agents_count": detected_agent_definitions,
        "agent_definitions_detected_count": detected_agent_definitions,
        "registered_personas_count": len(agents_map),
        "operational_agents_count": 0,
        "operational_agents_reason": "runtime activity is reported only by swarm telemetry",
        "roster_kind": "seed_personas_unverified",
        "divisions_breakdown": division_counts,
        "agents_roster": list(agents_map.values()),
        "limitations": [
            "A seed persona is not an installed or running agent.",
            "A detected agent definition is not operational until a task execution succeeds."
        ]
    }

# ─────────────────────────────────────────────────────────────────────────────
# 2. PROJECTS DEEP ANALYTICS
# ─────────────────────────────────────────────────────────────────────────────

_PROJECTS_CACHE = {"timestamp": 0, "data": []}

def query_projects_deep_analytics():
    import time
    now = time.time()
    if now - _PROJECTS_CACHE["timestamp"] < 30.0 and _PROJECTS_CACHE["data"]:
        return _PROJECTS_CACHE["data"]

    projects = []
    if os.path.exists(PROJECTS_DB):
        try:
            conn = sqlite3.connect(PROJECTS_DB)
            cur = conn.cursor()
            cur.execute("SELECT id, slug, name, primary_path, created_at FROM projects;")
            for row in cur.fetchall():
                pid, slug, name, ppath, created_at = row
                file_count = 0
                total_bytes = 0
                if ppath and os.path.exists(ppath):
                    try:
                        for item in os.listdir(ppath)[:50]:
                            ip = os.path.join(ppath, item)
                            if os.path.isfile(ip):
                                file_count += 1
                                total_bytes += os.path.getsize(ip)
                            elif os.path.isdir(ip) and item not in ['node_modules', '.git', 'venv', '.next', 'dist', 'build', '__pycache__']:
                                for sub in os.listdir(ip)[:20]:
                                    sp = os.path.join(ip, sub)
                                    if os.path.isfile(sp):
                                        file_count += 1
                                        total_bytes += os.path.getsize(sp)
                    except Exception:
                        pass

                projects.append({
                    "id": pid,
                    "slug": slug,
                    "name": name,
                    "path": ppath,
                    "created_at": created_at,
                    "files_tracked": file_count,
                    "size_mb": round(total_bytes / (1024 * 1024), 2),
                    "health_status": "DIRECTORY_PRESENT" if ppath and os.path.exists(ppath) else "PATH_UNRESOLVED"
                })
            conn.close()
        except Exception:
            pass
    _PROJECTS_CACHE["timestamp"] = now
    _PROJECTS_CACHE["data"] = projects
    return projects

# ─────────────────────────────────────────────────────────────────────────────
# 3. TRACEABILITY & REQUIREMENT COMPLIANCE ENGINE (HTP-V5 & PROCEDURES.MD)
# ─────────────────────────────────────────────────────────────────────────────

_TRACEABILITY_CACHE = {"timestamp": 0, "data": {}}

def query_traceability_compliance():
    import time
    now = time.time()
    if now - _TRACEABILITY_CACHE["timestamp"] < 60.0 and _TRACEABILITY_CACHE["data"]:
        return _TRACEABILITY_CACHE["data"]

    # Scan all skills in .agents/skills
    skills_dir = os.path.join(HERMES_ROOT, ".agents", "skills")
    skill_files = glob.glob(os.path.join(skills_dir, "*", "SKILL.md"))
    
    total_skills = len(skill_files)
    valid_file_id = 0
    valid_security_level = 0
    valid_retention = 0
    valid_merkle_root = 0
    valid_signature = 0
    valid_req_refs = 0
    valid_test_refs = 0
    anti_mock_admitted = 0

    for sf in skill_files:
        try:
            with open(sf, "r", encoding="utf-8", errors="ignore") as f:
                c = f.read(1200)
                if "@file_id" in c: valid_file_id += 1
                if "@security_level" in c: valid_security_level += 1
                if "@retention_policy" in c: valid_retention += 1
                if "@merkle_root_hash" in c: valid_merkle_root += 1
                if "@signature_scheme" in c or "@audit_signature" in c: valid_signature += 1
                if "@requirement_refs" in c: valid_req_refs += 1
                if "@test_refs" in c: valid_test_refs += 1
                if "@impl_status_tmp_mock false" in c or "@admissibility admitted" in c: anti_mock_admitted += 1
        except Exception:
            pass

    # Core source files audited
    core_files = [
        os.path.join(HERMES_ROOT, "tools", "tuios", "hermes_data_bridge.py"),
        os.path.join(HERMES_ROOT, "tools", "tuios", "hermes-cli.js"),
        os.path.join(HERMES_ROOT, "hermes-agent", "apps", "desktop", "src", "app", "pi-galaxy-brain", "index.tsx")
    ]
    core_compliant = sum(1 for cf in core_files if os.path.exists(cf) and "@file_id" in open(cf, "r", encoding="utf-8", errors="ignore").read(500))

    metadata_coverage = round(((valid_file_id + valid_security_level + valid_merkle_root + valid_signature) / max(1, total_skills * 4)) * 100, 1)

    res = {
        "available": os.path.isdir(skills_dir),
        "source": "static metadata presence scan; no cryptographic or legal certification",
        "declared_standard": "HTP-V5 metadata headers",
        "total_skills_inspected": total_skills,
        "header_validations": {
            "file_id_present": valid_file_id,
            "security_level_classified": valid_security_level,
            "retention_policy_nis2": valid_retention,
            "merkle_dag_anchored": valid_merkle_root,
            "signature_fields_present_unverified": valid_signature,
            "requirement_refs_linked": valid_req_refs,
            "test_refs_present_unverified": valid_test_refs,
            "anti_mock_declarations_present_unverified": anti_mock_admitted
        },
        "metadata_coverage_percent": metadata_coverage,
        "core_framework_headers_present": f"{core_compliant}/{len(core_files)}",
        "cryptographic_verification_performed": False,
        "control_enforcement_verified": False,
        "limitations": [
            "Header presence is not proof that a signature, Merkle chain, retention policy, GDPR control, ISO control, or NIS2 control is valid or enforced."
        ]
    }
    _TRACEABILITY_CACHE["timestamp"] = now
    _TRACEABILITY_CACHE["data"] = res
    return res

# ─────────────────────────────────────────────────────────────────────────────
# 4. SWARM WORKLOAD & EXECUTION CYCLE ANALYTICS
# ─────────────────────────────────────────────────────────────────────────────

def query_swarm_workload():
    buzz = {}
    if os.path.exists(BUZZ_STATE):
        try:
            with open(BUZZ_STATE, "r", encoding="utf-8") as f:
                buzz = json.load(f)
        except Exception:
            pass

    active_swarm = buzz.get("swarms", [{}])[0] if buzz.get("swarms") else {}
    telemetry_events = buzz.get("telemetry_events", [])
    
    # Event breakdown by tool and agent
    tool_counts = {}
    agent_activity = {}
    for evt in telemetry_events:
        tool = evt.get("details", {}).get("tool") or evt.get("event_type") or "unknown"
        agent = evt.get("agent_id") or "unassigned"
        tool_counts[tool] = tool_counts.get(tool, 0) + 1
        agent_activity[agent] = agent_activity.get(agent, 0) + 1

    return {
        "available": bool(active_swarm or telemetry_events),
        "source": BUZZ_STATE if os.path.exists(BUZZ_STATE) else None,
        "swarm_id": active_swarm.get("swarm_id"),
        "name": active_swarm.get("name"),
        "status": active_swarm.get("status"),
        "active_agents_count": len(active_swarm.get("agents", [])),
        "agents": active_swarm.get("agents", []),
        "eval_metrics": active_swarm.get("eval_metrics") or {},
        "telemetry_events_count": len(telemetry_events),
        "tool_invocations_breakdown": tool_counts,
        "agent_activity_heat": agent_activity,
        "recent_events": telemetry_events[-6:]
    }

# ─────────────────────────────────────────────────────────────────────────────
# 5. GENERAL SYSTEM, PORTS, HARDWARE & STATE QUERIES
# ─────────────────────────────────────────────────────────────────────────────

def query_state_db():
    res = {
        "sessions_count": 0,
        "messages_count": 0,
        "input_tokens_total": 0,
        "output_tokens_total": 0,
        "cache_tokens_total": 0,
        "reasoning_tokens_total": 0,
        "tool_calls_total": 0,
        "models_usage": {},
        "recent_sessions": [],
        "cache_hit_ratio_percent": 0.0,
        "prompt_amplification_ratio": 0.0,
        "db_size_mb": get_file_size_mb(STATE_DB)
    }
    if not os.path.exists(STATE_DB):
        return res

    try:
        conn = sqlite3.connect(STATE_DB)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM sessions;")
        res["sessions_count"] = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM messages;")
        res["messages_count"] = cur.fetchone()[0]

        cur.execute("SELECT sum(input_tokens), sum(output_tokens), sum(cache_read_tokens), sum(reasoning_tokens), sum(tool_call_count) FROM sessions;")
        totals = cur.fetchone()
        if totals:
            in_t = totals[0] or 0
            out_t = totals[1] or 0
            cache_t = totals[2] or 0
            res["input_tokens_total"] = in_t
            res["output_tokens_total"] = out_t
            res["cache_tokens_total"] = cache_t
            res["reasoning_tokens_total"] = totals[3] or 0
            res["tool_calls_total"] = totals[4] or 0

            if (in_t + cache_t) > 0:
                res["cache_hit_ratio_percent"] = round((cache_t / (in_t + cache_t)) * 100, 2)
            if out_t > 0:
                res["prompt_amplification_ratio"] = round(in_t / out_t, 2)
        
        cur.execute("SELECT model, count(*), sum(input_tokens), sum(output_tokens) FROM sessions GROUP BY model;")
        for row in cur.fetchall():
            res["models_usage"][row[0] or "default"] = {
                "session_count": row[1],
                "in_tokens": row[2] or 0,
                "out_tokens": row[3] or 0
            }
            
        cur.execute("SELECT id, title, started_at, model, message_count FROM sessions ORDER BY started_at DESC LIMIT 8;")
        for row in cur.fetchall():
            res["recent_sessions"].append({
                "id": row[0],
                "title": row[1] or "Untitled Session",
                "started_at": row[2],
                "model": row[3] or "default",
                "messages": row[4] or 0
            })
        conn.close()
    except Exception as e:
        res["error"] = str(e)
    return res

def query_github_catalog():
    res = { "repos_count": 0, "categories": {}, "sample_repos": [] }
    if os.path.exists(GITHUB_CATALOG_DB):
        try:
            conn = sqlite3.connect(GITHUB_CATALOG_DB)
            cur = conn.cursor()
            cur.execute("SELECT count(*) FROM repos;")
            res["repos_count"] = cur.fetchone()[0]

            cur.execute("SELECT category, count(*) FROM repos GROUP BY category;")
            for row in cur.fetchall():
                res["categories"][row[0] or "general"] = row[1]

            cur.execute("SELECT full_name, category, description FROM repos LIMIT 6;")
            for row in cur.fetchall():
                res["sample_repos"].append({
                    "full_name": row[0],
                    "category": row[1],
                    "desc": (row[2] or "")[:60]
                })
            conn.close()
        except Exception:
            pass
    return res

def query_ports():
    target_ports = [
        {"port": 8095, "name": "Kimi-compatible First-Layer / Hydra Bridge"},
        {"port": 8090, "name": "Hydra Task Router"},
        {"port": 3000, "name": "LDG Innovation (Next.js 15)"},
        {"port": 5432, "name": "LDG Innovation PostgreSQL"},
        {"port": 3033, "name": "Hydra Router Hub Core"},
        {"port": 5195, "name": "Hermes IDE Unchained"},
        {"port": 5199, "name": "Pi Galaxy Brain Live HUD"},
        {"port": 3100, "name": "Paperclip Swarm Hub"},
        {"port": 19080, "name": "Founder OS Core"}
    ]
    probed = []
    for item in target_ports:
        p = item["port"]
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.02)
                is_open = (s.connect_ex(('127.0.0.1', p)) == 0)
        except Exception:
            is_open = False
        probed.append({
            "port": p,
            "name": item["name"],
            "status": "ONLINE" if is_open else "STANDBY"
        })
    return probed

def query_git_velocity():
    commits = 0
    branch = "main"
    if os.path.exists(HERMES_AGENT_DIR):
        try:
            out = subprocess.check_output(['git', 'rev-list', '--count', 'HEAD'], cwd=HERMES_AGENT_DIR, stderr=subprocess.DEVNULL)
            commits = int(out.decode().strip())
            out_b = subprocess.check_output(['git', 'branch', '--show-current'], cwd=HERMES_AGENT_DIR, stderr=subprocess.DEVNULL)
            branch = out_b.decode().strip() or "main"
        except Exception:
            pass
    return {
        "commits_total": commits,
        "active_branch": branch
    }

def query_storage_subsystem():
    # Storage must remain available even when the optional psutil package is
    # absent from the selected TUIOS Python runtime.
    disk_c = psutil.disk_usage("C:\\") if psutil is not None else shutil.disk_usage("C:\\")
    percent_used = round((disk_c.used / disk_c.total) * 100, 1) if disk_c.total else None
    return {
        "drive_c": {
            "total_gb": round(disk_c.total / (1024**3), 2),
            "used_gb": round(disk_c.used / (1024**3), 2),
            "free_gb": round(disk_c.free / (1024**3), 2),
            "percent_used": getattr(disk_c, "percent", percent_used),
            "sensor_source": "psutil" if psutil is not None else "stdlib.shutil"
        },
        "database_sizes_mb": {
            "state.db": get_file_size_mb(STATE_DB),
            "github-master-catalog.db": get_file_size_mb(GITHUB_CATALOG_DB),
            "kanban.db": get_file_size_mb(KANBAN_DB),
            "projects.db": get_file_size_mb(PROJECTS_DB),
            "response_store.db": get_file_size_mb(RESPONSE_STORE_DB)
        },
        "knowledge_sizes_mb": {
            "CODEBASE_KNOWLEDGE.json": get_file_size_mb(CODEBASE_KNOWLEDGE)
        }
    }

def query_system_hardware():
    if psutil is not None:
        try:
            vm = psutil.virtual_memory()
            proc = psutil.Process()
            rss_mb = round(proc.memory_info().rss / (1024 * 1024), 2)
            return {
                "cpu_percent": psutil.cpu_percent(interval=0.05),
                "cpu_cores_physical": psutil.cpu_count(logical=False),
                "cpu_cores_logical": psutil.cpu_count(logical=True),
                "total_ram_gb": round(vm.total / (1024**3), 2),
                "available_ram_gb": round(vm.available / (1024**3), 2),
                "used_ram_gb": round(vm.used / (1024**3), 2),
                "ram_percent": vm.percent,
                "process_rss_mb": rss_mb,
                "headless_ram_savings_percent": None,
                "headless_ram_savings_reason": "no controlled GUI-versus-headless baseline has been measured",
                "sensor_source": "psutil",
                "sensor_available": True
            }
        except Exception:
            pass

    if sys.platform == "win32":
        try:
            class FILETIME(ctypes.Structure):
                _fields_ = [("low", ctypes.c_ulong), ("high", ctypes.c_ulong)]

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("length", ctypes.c_ulong),
                    ("memory_load", ctypes.c_ulong),
                    ("total_phys", ctypes.c_ulonglong),
                    ("avail_phys", ctypes.c_ulonglong),
                    ("total_page_file", ctypes.c_ulonglong),
                    ("avail_page_file", ctypes.c_ulonglong),
                    ("total_virtual", ctypes.c_ulonglong),
                    ("avail_virtual", ctypes.c_ulonglong),
                    ("avail_extended_virtual", ctypes.c_ulonglong),
                ]

            class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
                _fields_ = [
                    ("cb", ctypes.c_ulong),
                    ("page_fault_count", ctypes.c_ulong),
                    ("peak_working_set_size", ctypes.c_size_t),
                    ("working_set_size", ctypes.c_size_t),
                    ("quota_peak_paged_pool_usage", ctypes.c_size_t),
                    ("quota_paged_pool_usage", ctypes.c_size_t),
                    ("quota_peak_non_paged_pool_usage", ctypes.c_size_t),
                    ("quota_non_paged_pool_usage", ctypes.c_size_t),
                    ("pagefile_usage", ctypes.c_size_t),
                    ("peak_pagefile_usage", ctypes.c_size_t),
                ]

            def filetime_value(value):
                return (value.high << 32) | value.low

            def system_times():
                idle, kernel, user = FILETIME(), FILETIME(), FILETIME()
                if not ctypes.windll.kernel32.GetSystemTimes(
                    ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)
                ):
                    raise ctypes.WinError()
                return tuple(filetime_value(value) for value in (idle, kernel, user))

            before = system_times()
            time.sleep(0.05)
            after = system_times()
            idle_delta = after[0] - before[0]
            total_delta = (after[1] - before[1]) + (after[2] - before[2])
            cpu_percent = round(100.0 * (1.0 - idle_delta / total_delta), 1) if total_delta else None

            memory = MEMORYSTATUSEX()
            memory.length = ctypes.sizeof(MEMORYSTATUSEX)
            if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
                raise ctypes.WinError()

            counters = PROCESS_MEMORY_COUNTERS()
            counters.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS)
            ctypes.windll.kernel32.GetCurrentProcess.restype = ctypes.c_void_p
            process_handle = ctypes.windll.kernel32.GetCurrentProcess()
            ctypes.windll.psapi.GetProcessMemoryInfo.argtypes = [
                ctypes.c_void_p,
                ctypes.POINTER(PROCESS_MEMORY_COUNTERS),
                ctypes.c_ulong,
            ]
            ctypes.windll.psapi.GetProcessMemoryInfo.restype = ctypes.c_int
            if not ctypes.windll.psapi.GetProcessMemoryInfo(
                process_handle, ctypes.byref(counters), counters.cb
            ):
                raise ctypes.WinError()

            rss_mb = round(counters.working_set_size / (1024 * 1024), 2)
            total_ram_gb = round(memory.total_phys / (1024**3), 2)
            available_ram_gb = round(memory.avail_phys / (1024**3), 2)
            used_ram_gb = round((memory.total_phys - memory.avail_phys) / (1024**3), 2)
            return {
                "cpu_percent": cpu_percent,
                "cpu_cores_physical": None,
                "cpu_cores_logical": os.cpu_count(),
                "total_ram_gb": total_ram_gb,
                "available_ram_gb": available_ram_gb,
                "used_ram_gb": used_ram_gb,
                "ram_percent": memory.memory_load,
                "process_rss_mb": rss_mb,
                "headless_ram_savings_percent": None,
                "headless_ram_savings_reason": "no controlled GUI-versus-headless baseline has been measured",
                "sensor_source": "win32_api",
                "sensor_available": True
            }
        except Exception as error:
            return {
                "cpu_percent": None,
                "cpu_cores_physical": None,
                "cpu_cores_logical": os.cpu_count(),
                "total_ram_gb": None,
                "available_ram_gb": None,
                "used_ram_gb": None,
                "ram_percent": None,
                "process_rss_mb": None,
                "headless_ram_savings_percent": None,
                "sensor_source": "unavailable",
                "sensor_available": False,
                "sensor_error": str(error)
            }
    return {
        "cpu_percent": None,
        "cpu_cores_physical": None,
        "cpu_cores_logical": os.cpu_count(),
        "total_ram_gb": None,
        "available_ram_gb": None,
        "used_ram_gb": None,
        "ram_percent": None,
        "process_rss_mb": None,
        "headless_ram_savings_percent": None,
        "sensor_source": "unavailable",
        "sensor_available": False
    }

def query_catalog():
    if os.path.exists(CATALOG_CACHE):
        try:
            with open(CATALOG_CACHE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("totals", {})
        except Exception:
            pass
    return {}

def query_auth_providers():
    providers = []
    if os.path.exists(AUTH_JSON):
        try:
            with open(AUTH_JSON, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "providers" in data:
                    providers.extend(list(data["providers"].keys()))
                if "credential_pool" in data:
                    providers.extend(list(data["credential_pool"].keys()))
        except Exception:
            pass
    return sorted(list(set(providers)))

# ─────────────────────────────────────────────────────────────────────────────
# 10. KANBAN WORKFLOW, SPRINT BURNDOWN & TASK PROGRESS
# ─────────────────────────────────────────────────────────────────────────────

def query_kanban_burndown_and_tasks():
    tasks = []
    available = False
    error = None
    status_counts = {"triage": 0, "todo": 0, "in_progress": 0, "review": 0, "done": 0, "blocked": 0}
    priority_counts = {"urgent": 0, "high": 0, "medium": 0, "low": 0}

    if os.path.exists(KANBAN_DB):
        try:
            conn = sqlite3.connect(KANBAN_DB)
            cur = conn.cursor()
            cur.execute("SELECT id, title, assignee, status, priority, created_at, started_at, completed_at FROM tasks;")
            rows = cur.fetchall()
            available = True
            for r in rows:
                tid, title, assignee, status, priority, cat, sat, comp = r
                st = (status or "todo").lower()
                status_counts[st] = status_counts.get(st, 0) + 1
                pr = (priority or "medium").lower()
                priority_counts[pr] = priority_counts.get(pr, 0) + 1
                tasks.append({
                    "id": tid,
                    "title": title,
                    "assignee": assignee or "unassigned",
                    "status": st,
                    "priority": pr,
                    "created_at": cat,
                    "completed_at": comp
                })
            conn.close()
        except Exception as exc:
            error = str(exc)

    total_tasks = len(tasks)
    done_tasks = status_counts.get("done", 0)
    in_progress = status_counts.get("in_progress", 0)
    review_tasks = status_counts.get("review", 0)
    todo_tasks = status_counts.get("todo", 0)
    blocked_tasks = status_counts.get("blocked", 0)

    completion_rate_pct = round((done_tasks / total_tasks) * 100, 1) if total_tasks else None

    return {
        "available": available,
        "source": KANBAN_DB if os.path.exists(KANBAN_DB) else None,
        "error": error,
        "total_tasks_count": total_tasks,
        "completion_rate_percent": completion_rate_pct,
        "sprint_velocity_points": None,
        "sprint_velocity_reason": "story points are not stored in kanban.db",
        "status_breakdown": {
            "DONE": done_tasks,
            "IN_PROGRESS": in_progress,
            "REVIEW": review_tasks,
            "TODO": todo_tasks,
            "BLOCKED": blocked_tasks
        },
        "priority_breakdown": priority_counts,
        "active_sprint_tasks": tasks
    }

# ─────────────────────────────────────────────────────────────────────────────
# 11. TECHNICAL DEBT & CODE QUALITY ENGINE
# ─────────────────────────────────────────────────────────────────────────────

_TECH_DEBT_CACHE = {"timestamp": 0, "data": {}}

def query_technical_debt_metrics():
    import time
    now = time.time()
    if now - _TECH_DEBT_CACHE["timestamp"] < 120.0 and _TECH_DEBT_CACHE["data"]:
        return _TECH_DEBT_CACHE["data"]

    debt = {
        "files_scanned": 0,
        "total_loc": 0,
        "comment_lines": 0,
        "blank_lines": 0,
        "large_files_over_500_count": 0,
        "large_files_over_500": [],
        "htp_v5_compliant_files": 0,
        "non_compliant_files": 0,
        "estimated_refactoring_hours": None,
        "estimated_refactoring_hours_reason": "requires measured task sizing; no heuristic estimate is emitted",
        "documentation_coverage_pct": 0.0,
        "metadata_header_presence_pct": 0.0,
        "sovereign_compliance_pct": None,
        "technical_debt_tier": None,
        "scan_scope": "bounded source-file sample; dependencies and generated output excluded"
    }

    sample_targets = []
    # 1. Sample key tool files
    tools_dir = os.path.join(HERMES_ROOT, "tools")
    if os.path.exists(tools_dir):
        for item in os.listdir(tools_dir)[:30]:
            sub = os.path.join(tools_dir, item)
            if os.path.isfile(sub) and sub.endswith(('.py', '.js', '.cjs', '.mjs', '.ts', '.tsx')):
                sample_targets.append(sub)
            elif os.path.isdir(sub):
                for f in os.listdir(sub)[:5]:
                    fp = os.path.join(sub, f)
                    if os.path.isfile(fp) and fp.endswith(('.py', '.js', '.cjs', '.mjs', '.ts', '.tsx')):
                        sample_targets.append(fp)

    # 2. Sample key mecha projects
    mecha_dir = os.path.join(HERMES_ROOT, "mechaHD")
    if os.path.exists(mecha_dir):
        for item in os.listdir(mecha_dir)[:15]:
            sub = os.path.join(mecha_dir, item)
            if os.path.isdir(sub):
                for f in os.listdir(sub)[:4]:
                    fp = os.path.join(sub, f)
                    if os.path.isfile(fp) and fp.endswith(('.py', '.js', '.cjs', '.mjs', '.ts', '.tsx')):
                        sample_targets.append(fp)

    # 3. Sample root scripts
    for f in os.listdir(HERMES_ROOT)[:20]:
        fp = os.path.join(HERMES_ROOT, f)
        if os.path.isfile(fp) and fp.endswith(('.py', '.js', '.cjs', '.mjs', '.ts', '.tsx')):
            sample_targets.append(fp)

    for filepath in sample_targets[:100]:
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as fp:
                lines = fp.readlines()
                loc = len(lines)
                debt["files_scanned"] += 1
                debt["total_loc"] += loc
                if loc > 500:
                    debt["large_files_over_500_count"] += 1
                    if len(debt["large_files_over_500"]) < 5:
                        debt["large_files_over_500"].append({
                            "file": os.path.relpath(filepath, HERMES_ROOT).replace(chr(92), "/"),
                            "lines": loc
                        })
                has_header = False
                for l in lines:
                    if "@file_id" in l:
                        has_header = True
                    if l.strip().startswith("//") or l.strip().startswith("#") or l.strip().startswith("*"):
                        debt["comment_lines"] += 1
                    elif not l.strip():
                        debt["blank_lines"] += 1

                if has_header:
                    debt["htp_v5_compliant_files"] += 1
                else:
                    debt["non_compliant_files"] += 1
        except Exception:
            pass

    doc_ratio = round((debt["comment_lines"] / max(1, debt["total_loc"])) * 100, 1)
    metadata_ratio = round((debt["htp_v5_compliant_files"] / max(1, debt["files_scanned"])) * 100, 1)

    debt["documentation_coverage_pct"] = doc_ratio
    debt["metadata_header_presence_pct"] = metadata_ratio

    _TECH_DEBT_CACHE["timestamp"] = now
    _TECH_DEBT_CACHE["data"] = debt
    return debt

# ─────────────────────────────────────────────────────────────────────────────
# 12. 104+ ATOMIC GOALS & WORKFLOW 1-13 ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def query_atomic_goals_telemetry():
    goals_path = os.path.join(HERMES_ROOT, "tools", "swarm_goals", "atomic_goals_registry.json")
    if os.path.exists(goals_path):
        try:
            with open(goals_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                goals = data.get("goals", [])
                phases = data.get("workflow_phases", [])

                phase_stats = []
                for p in phases:
                    p_goals = [g for g in goals if g.get("phase_index") == p["index"]]
                    p_total = len(p_goals)
                    p_done = sum(1 for g in p_goals if g.get("status") == "done")
                    p_pct = round((p_done / max(1, p_total)) * 100, 1)
                    phase_stats.append({
                        "phase_index": p["index"],
                        "phase_name": p["name"],
                        "total_goals": p_total,
                        "done_goals": p_done,
                        "completion_pct": p_pct
                    })

                total_goals = len(goals)
                total_done = sum(1 for g in goals if g.get("status") == "done")
                overall_pct = round((total_done / max(1, total_goals)) * 100, 1)

                return {
                    "total_goals_count": total_goals,
                    "completed_goals_count": total_done,
                    "overall_completion_pct": overall_pct,
                    "workflow_phases_breakdown": phase_stats,
                    "goals_registry": goals
                }
        except Exception:
            pass
    return {"total_goals_count": 0, "overall_completion_pct": 0, "workflow_phases_breakdown": []}

# ─────────────────────────────────────────────────────────────────────────────
# 13. IMMUTABLE EXECUTION LEDGER TELEMETRY (HTP-V5 & NIS2)
# ─────────────────────────────────────────────────────────────────────────────

def query_immutable_ledger_telemetry():
    db_path = os.path.join(HERMES_ROOT, "tools", "swarm_goals", "immutable_execution_ledger.db")
    if not os.path.exists(db_path):
        return {"available": False, "source": None, "total_executions_recorded": 0, "contract_adherence_rate_pct": None, "recent_ledger_entries": []}
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM execution_ledger;")
        total_executions = cur.fetchone()[0]
        
        cur.execute("SELECT delivery_match_status, count(*) FROM execution_ledger GROUP BY delivery_match_status;")
        match_breakdown = {}
        for row in cur.fetchall():
            match_breakdown[row[0]] = row[1]

        cur.execute("""
            SELECT
                SUM(CASE WHEN ed25519_signature LIKE 'ED512-SIG-%' THEN 1 ELSE 0 END),
                SUM(CASE WHEN ed25519_signature LIKE 'UNSIGNED-SHA512-TAG-%' THEN 1 ELSE 0 END)
            FROM execution_ledger;
        """)
        signature_counts = cur.fetchone() or (0, 0)
            
        cur.execute("""
            SELECT entry_id, task_id, goal_id, project_id, phase_index, actor_agent_id, actor_role, model_id,
                   raw_input_prompt, delivery_match_status, tokens_in, tokens_out, tokens_cache, latency_ms,
                   merkle_entry_hash, ed25519_signature, iso_timestamp
            FROM execution_ledger
            ORDER BY id DESC LIMIT 15;
        """)
        recent_entries = []
        for r in cur.fetchall():
            recent_entries.append({
                "entry_id": r[0],
                "task_id": r[1],
                "goal_id": r[2],
                "project_id": r[3],
                "phase_index": r[4],
                "actor_agent_id": r[5],
                "actor_role": r[6],
                "model_id": r[7],
                "input_preview": (r[8] or "")[:120],
                "match_status": r[9],
                "tokens_in": r[10],
                "tokens_out": r[11],
                "tokens_cache": r[12],
                "latency_ms": r[13],
                "merkle_hash": (r[14] or "")[:16] + "...",
                "signature": (r[15] or "")[:16] + "...",
                "timestamp": r[16]
            })
        conn.close()
        
        recorded_claim_rate = round((match_breakdown.get("PERFECT_MATCH", 0) / max(1, total_executions)) * 100, 1)
        return {
            "available": True,
            "source": db_path,
            "cryptographic_verification_performed": False,
            "signature_scheme": "none_verified",
            "legacy_pseudo_signature_records": int(signature_counts[0] or 0),
            "unsigned_integrity_tag_records": int(signature_counts[1] or 0),
            "total_executions_recorded": total_executions,
            "contract_adherence_rate_pct": None,
            "contract_adherence_reason": "legacy delivery_match_status values were not independently verified",
            "recorded_perfect_match_claim_rate_pct": recorded_claim_rate,
            "delivery_match_breakdown": match_breakdown,
            "recent_ledger_entries": recent_entries
        }
    except Exception as e:
        return {"available": False, "source": db_path, "total_executions_recorded": 0, "contract_adherence_rate_pct": None, "recent_ledger_entries": [], "error": str(e)}

# ─────────────────────────────────────────────────────────────────────────────
# 14. SOVEREIGN REQUIREMENTS ENGINE TELEMETRY (104+ REQUIREMENTS)
# ─────────────────────────────────────────────────────────────────────────────

def query_sovereign_requirements_telemetry():
    reqs_script = os.path.join(HERMES_ROOT, "tools", "swarm_goals", "requirements_engine.py")
    if os.path.exists(reqs_script):
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location("requirements_engine", reqs_script)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod.get_requirements_telemetry()
        except Exception as exc:
            return {"available": False, "source": reqs_script, "total_requirements_count": 0, "compliance_rate_pct": None, "phase_breakdown": [], "error": str(exc)}
    return {"available": False, "source": None, "total_requirements_count": 0, "compliance_rate_pct": None, "phase_breakdown": [], "error": "requirements engine not found"}

def query_live_swarm_job_telemetry():
    """Queries real-time telemetry from tools/swarm_goals/live_job_state.json."""
    live_path = os.path.join(HERMES_ROOT, "tools", "swarm_goals", "live_job_state.json")
    if os.path.exists(live_path):
        try:
            with open(live_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            modified_at = datetime.fromtimestamp(os.path.getmtime(live_path), tz=timezone.utc)
            age_seconds = max(0, int((datetime.now(timezone.utc) - modified_at).total_seconds()))
            data["available"] = True
            data["source"] = live_path
            data["source_modified_at"] = modified_at.isoformat().replace("+00:00", "Z")
            data["evidence_age_seconds"] = age_seconds
            data["runtime_live"] = age_seconds <= 300
            if not data["runtime_live"]:
                data["recorded_status"] = data.get("status")
                data["status"] = "STALE_RECORDED_STATE"
                data["recorded_snapshot"] = {
                    "goals_progress_pct": data.get("goals_progress_pct"),
                    "time_progress_pct": data.get("time_progress_pct"),
                    "current_cycle": data.get("current_cycle"),
                    "current_target_project": data.get("current_target_project"),
                    "current_active_agent": data.get("current_active_agent"),
                    "current_model": data.get("current_model"),
                    "log_records": len(data.get("live_agent_logs") or []),
                    "warning": "Historical values are retained as an unverified snapshot, not live telemetry."
                }
                for key in (
                    "elapsed_seconds", "remaining_seconds", "elapsed_formatted", "remaining_formatted",
                    "time_progress_pct", "goals_progress_pct", "progress_pct", "performance_status",
                    "current_cycle", "current_target_project", "current_active_agent",
                    "current_active_role", "current_model"
                ):
                    data[key] = None
                data["live_agent_logs"] = []
            return data
        except Exception as exc:
            return {"available": False, "source": live_path, "error": str(exc), "live_agent_logs": []}
    return {
        "available": False,
        "source": None,
        "status": "NO_RUNTIME_EVIDENCE",
        "live_agent_logs": []
    }

def query_swarm_jobs_telemetry():
    """Queries configured multi-agent swarm jobs and pipelines."""
    jobs_path = os.path.join(HERMES_ROOT, "tools", "swarm_goals", "swarm_jobs_registry.json")
    if os.path.exists(jobs_path):
        try:
            with open(jobs_path, "r", encoding="utf-8") as f:
                jobs = json.load(f)
                normalized_jobs = []
                for job in jobs:
                    normalized = dict(job)
                    normalized["registry_status"] = job.get("status")
                    normalized["status"] = "REGISTERED_ACTIVE" if job.get("status") == "active" else "REGISTERED"
                    normalized["runtime_live"] = False
                    normalized["source"] = jobs_path
                    normalized_jobs.append(normalized)
                return {
                    "available": True,
                    "source": jobs_path,
                    "total_jobs_count": len(normalized_jobs),
                    "active_jobs_count": 0,
                    "declared_active_jobs_count": len([j for j in jobs if j.get("status") == "active"]),
                    "jobs": normalized_jobs
                }
        except Exception:
            pass
    return {"available": False, "source": jobs_path if os.path.exists(jobs_path) else None, "total_jobs_count": 0, "active_jobs_count": 0, "declared_active_jobs_count": 0, "jobs": []}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN AGGREGATOR
# ─────────────────────────────────────────────────────────────────────────────

def gather_full_real_metrics():
    state_metrics = query_state_db()
    projects = query_projects_deep_analytics()
    github_cat = query_github_catalog()
    ports = query_ports()
    git_vel = query_git_velocity()
    storage = query_storage_subsystem()
    swarm = query_swarm_workload()
    catalog_totals = query_catalog()
    auth_providers = query_auth_providers()
    hw = query_system_hardware()
    agents_data = extract_registered_agent_personas()
    compliance = query_traceability_compliance()
    kanban_data = query_kanban_burndown_and_tasks()
    tech_debt = query_technical_debt_metrics()
    goals_data = query_atomic_goals_telemetry()
    ledger_data = query_immutable_ledger_telemetry()
    reqs_data = query_sovereign_requirements_telemetry()
    live_job = query_live_swarm_job_telemetry()
    swarm_jobs = query_swarm_jobs_telemetry()

    return {
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "database": {
            "state_db": state_metrics,
            "projects_count": len(projects),
            "projects": projects,
            "github_catalog": github_cat,
            "storage_subsystem": storage
        },
        "live_swarm_job": live_job,
        "swarm_jobs": swarm_jobs,
        "enterprise_agents": agents_data,
        "traceability_compliance": compliance,
        "swarm": swarm,
        "kanban": kanban_data,
        "technical_debt": tech_debt,
        "atomic_goals": goals_data,
        "sovereign_requirements": reqs_data,
        "immutable_ledger": ledger_data,
        "catalog": catalog_totals,
        "auth_providers": auth_providers,
        "ports_probe": ports,
        "git_velocity": git_vel,
        "hardware": hw
    }

if __name__ == "__main__":
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    metrics = gather_full_real_metrics()
    print(json.dumps(metrics, indent=2))
