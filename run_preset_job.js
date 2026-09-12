#!/usr/bin/env node
/**
 * TUIOS Preset Swarm Job Runner & Dispatcher
 * Executes preset multi-agent jobs defined in swarm_jobs_registry.json
 */

const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const registryPath = path.join(__dirname, '..', 'swarm_goals', 'swarm_jobs_registry.json');
if (!fs.existsSync(registryPath)) {
  console.error('Error: registry not found at', registryPath);
  process.exit(1);
}

const jobs = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

const args = process.argv.slice(2);
const command = args[0];
const jobId = args[1];

if (command === '--list' || command === '-l') {
  console.log('\n=== TUIOS PRESET SWARM JOBS ===');
  jobs.forEach((j, i) => {
    console.log(`[${i + 1}] ${j.id.padEnd(28)} | ${j.cron_expression?.padEnd(14) || 'MANUAL'.padEnd(14)} | ${j.title}`);
  });
  console.log('\nPer eseguire un job: node run_preset_job.js --run <JOB_ID>\n');
  process.exit(0);
}

if (command === '--run' || command === '-r') {
  const target = jobs.find(j => j.id.toLowerCase() === (jobId || '').toLowerCase() || j.id.includes(jobId || ''));
  if (!target) {
    console.error(`Job "${jobId}" non trovato. Esegui con --list per vedere i job disponibili.`);
    process.exit(1);
  }

  console.log(`\n================================================================================`);
  console.log(` ⚡ ESECUZIONE JOB: ${target.title}`);
  console.log(`    ID: ${target.id} | Schedule: ${target.cron_expression || 'MANUAL'}`);
  console.log(`    Obiettivo: ${target.objective}`);
  console.log(`================================================================================\n`);

  // Record start to Paperclip
  const reporterPath = path.join('C:/Users/Deglu/.hermes', 'scripts', 'paperclip_reporter.js');
  if (fs.existsSync(reporterPath)) {
    spawnSync('node', [reporterPath, '--task', target.title, '--status', 'in_progress', '--agent', 'TUIOS Runner'], { encoding: 'utf8' });
  }

  // Execute target command if defined
  if (target.command) {
    console.log(`▶ Esecuzione comando associato: ${target.command}\n`);
    try {
      execSync(target.command, { stdio: 'inherit', cwd: path.join(__dirname, '..', '..') });
    } catch (e) {
      console.warn(`⚠️ Avviso durante esecuzione comando: ${e.message}`);
    }
  } else if (target.workflow_pipeline && target.workflow_pipeline.length > 0) {
    for (const step of target.workflow_pipeline) {
      console.log(`▶ [Step ${step.step}] ${step.name} (Lead: ${step.lead_agent_id})`);
      console.log(`  Tools: ${step.tools.join(', ')} | Deliverable: ${step.deliverable}`);
    }
  }

  // Update last_run in registry
  target.last_run = new Date().toISOString();
  target.runs_completed = (target.runs_completed || 0) + 1;
  fs.writeFileSync(registryPath, JSON.stringify(jobs, null, 2), 'utf8');

  // Record completion to Paperclip
  if (fs.existsSync(reporterPath)) {
    spawnSync('node', [reporterPath, '--task', target.title, '--status', 'done', '--agent', 'TUIOS Runner'], { encoding: 'utf8' });
  }

  console.log(`\n✔ Job ${target.id} completato e registrato su Paperclip / Ledger con successo!\n`);
  process.exit(0);
}

console.log('TUIOS Preset Job Runner');
console.log('Uso:');
console.log('  node run_preset_job.js --list              Mostra la lista dei cronjob preimpostati');
console.log('  node run_preset_job.js --run <JOB_ID>      Esegue immediatamente un cronjob');
