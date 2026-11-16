'use strict';
/**
 * MVX TUIOS headless service control.
 * Never starts a frontend, accepts an arbitrary URL or shells user input.
 * An API is usable only after it has been declared in the operator manifest.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PROJECTS = Object.freeze({
  'founder-os': 'MVX-founder-OS',
  'founder-os-monitor': 'FOMO',
  'mvx-saas-master-ldg': null,
  'mvx-saas-master-customer': null,
  'mvx-trading-master-v2': 'MVX_TRADING_MASTER_V2',
});
const ID = /^[a-z][a-z0-9-]{2,63}$/;
const OP = /^[a-z][a-z0-9-]{1,63}$/;
const ENV = /^[A-Z][A-Z0-9_]{2,100}$/;
const API_PATH = /^\/api\/[A-Za-z0-9_./-]{1,180}$/;

function fail(code, status = 2) {
  const error = new Error(code);
  error.exitCode = status;
  throw error;
}
function inside(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
function rootDir(env = process.env) {
  return path.resolve(env.HERMES_ROOT || path.join(env.USERPROFILE || require('node:os').homedir(), '.hermes'));
}
function configurationPath(root, env = process.env) {
  const configDir = path.join(root, 'config');
  const configFile = path.resolve(env.MVX_TUIOS_CONFIG_PATH || path.join(configDir, 'mvx-tuios-services.json'));
  if (!inside(configDir, configFile)) fail('CONFIG_PATH_OUTSIDE_OPERATOR_DIRECTORY');
  return configFile;
}
function validApiPath(value) {
  return typeof value === 'string' && API_PATH.test(value) &&
    !value.includes('//') && !value.split('/').includes('..') && !value.split('/').includes('.');
}
function loadRegistry(root = rootDir(), env = process.env) {
  const file = configurationPath(root, env);
  const source = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { schema: 'mvx.tuios.services.v1', services: {} };
  if (source.schema !== 'mvx.tuios.services.v1' || !source.services || typeof source.services !== 'object' || Array.isArray(source.services))
    fail('INVALID_SERVICE_MANIFEST');
  const services = {};
  for (const id of Object.keys(PROJECTS)) {
    const raw = source.services[id] || {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('INVALID_SERVICE_' + id);
    const projectPath = raw.projectPath ? path.resolve(root, raw.projectPath) :
      PROJECTS[id] ? path.join(root, PROJECTS[id]) : null;
    if (projectPath && !inside(root, projectPath)) fail('PROJECT_PATH_OUTSIDE_WORKSPACE');
    let origin = null;
    if (raw.origin !== undefined) {
      const url = new URL(raw.origin);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.href !== url.origin + '/' || url.username || url.password ||
          (url.protocol !== 'https:' && !(local && url.protocol === 'http:')))
        fail('INVALID_SERVICE_ORIGIN_' + id);
      origin = url.origin;
    }
    if (raw.tokenEnvironment !== undefined && !ENV.test(raw.tokenEnvironment))
      fail('INVALID_TOKEN_ENVIRONMENT_' + id);
    const operations = {};
    for (const [operation, entry] of Object.entries(raw.operations || {})) {
      if (!OP.test(operation) || !entry || typeof entry !== 'object' ||
          !validApiPath(entry.path) || !['GET','POST','PATCH','DELETE'].includes(entry.method) ||
          (entry.method !== 'GET' && entry.readOnly === true))
        fail('INVALID_OPERATION_' + id);
      operations[operation] = { method: entry.method, path: entry.path,
        authenticated: entry.authenticated !== false,
        readOnly: entry.method === 'GET' };
    }
    services[id] = { id, projectPath, installed: !!projectPath && fs.existsSync(projectPath),
      origin, tokenEnvironment: raw.tokenEnvironment || null,
      operations, launch: raw.launch || null };
  }
  if (Object.keys(source.services).some(id => !Object.hasOwn(PROJECTS, id))) fail('UNKNOWN_SERVICE_ID');
  return services;
}
function show(services) {
  return Object.values(services).map(({id,installed,origin,operations}) =>
    ({id, installed, configured: !!origin, operations: Object.keys(operations)}));
}
function operationFor(service, operation) {
  const op = service.operations[operation];
  if (!op) fail('OPERATION_NOT_DECLARED');
  if (!service.origin) fail('SERVICE_ENDPOINT_NOT_CONFIGURED');
  return op;
}
async function invoke(service, operation, {env = process.env, payload = null, fetchImpl = fetch} = {}) {
  const op = operationFor(service, operation);
  if (payload != null && op.readOnly) fail('READONLY_OPERATION_DISALLOWS_BODY');
  if (payload != null && JSON.stringify(payload).length > 65536) fail('PAYLOAD_TOO_LARGE');
  const token = service.tokenEnvironment ? env[service.tokenEnvironment] : null;
  // A manifest may mark public GETs as anonymous, but no write may bypass
  // operator-issued service credentials, even if misconfigured as public.
  if ((op.authenticated || !op.readOnly) && (!token || token.length < 20)) fail('SERVICE_TOKEN_REQUIRED', 3);
  const headers = {'Accept':'application/json'};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (payload != null) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetchImpl(service.origin + op.path, {
      method: op.method, headers, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      ...(payload != null ? { body: JSON.stringify(payload) } : {})
    });
  } catch { fail('BACKEND_UNREACHABLE', 4); }
  let output = '';
  try { output = (await response.text()).slice(0, 65536); } catch {}
  let data;
  try { data = JSON.parse(output); } catch { data = { message: output }; }
  return {service: service.id, operation, httpStatus: response.status,
    ok: response.ok, response: data};
}
function validateLaunch(service, root) {
  if (!service.installed || !service.projectPath) fail('PROJECT_NOT_INSTALLED');
  const item = service.launch;
  if (!item || !['node', 'python'].includes(item.runtime) ||
      typeof item.entry !== 'string' || !/^[A-Za-z0-9_.\/-]+$/.test(item.entry) ||
      item.entry.includes('..') || /^(?:[A-Za-z]:|\/)/.test(item.entry) ||
      !Array.isArray(item.args) || item.args.some(x => typeof x !== 'string' || !/^[A-Za-z0-9_./=:-]{1,100}$/.test(x)))
    fail('BACKEND_LAUNCH_NOT_APPROVED');
  const entry = path.resolve(service.projectPath, item.entry);
  if (!inside(service.projectPath, entry) || !inside(root, entry) ||
      !(item.runtime === 'node' ? /\.(m?js|cjs)$/.test(entry) : /\.py$/.test(entry)) ||
      !fs.existsSync(entry))
    fail('INVALID_BACKEND_ENTRY');
  // Reject junctions/symlinks that escape the authorized .hermes workspace.
  const realRoot = fs.realpathSync(root);
  const realProject = fs.realpathSync(service.projectPath);
  const realEntry = fs.realpathSync(entry);
  if (!inside(realRoot, realProject) || !inside(realProject, realEntry))
    fail('BACKEND_ENTRY_SYMLINK_ESCAPE');
  return {runtime:item.runtime, entry, args:item.args};
}
function startBackend(service, {root = rootDir(), env = process.env, spawnImpl = spawn} = {}) {
  if (env.MVX_TUIOS_PROFILE !== 'private') fail('PRIVATE_OPERATOR_PROFILE_REQUIRED', 3);
  const launch = validateLaunch(service, root);
  let executable = process.execPath;
  if (launch.runtime === 'python') {
    const configured = env.MVX_TUIOS_PYTHON_EXE || '';
    if (!path.isAbsolute(configured) || !/python(?:3(?:\.\d+)?)?(?:\.exe)?$/i.test(path.basename(configured)) ||
        !fs.existsSync(configured)) fail('PYTHON_RUNTIME_NOT_APPROVED', 3);
    executable = fs.realpathSync(configured);
  }
  const logDir = path.join(root, 'logs', 'mvx-tuios');
  fs.mkdirSync(logDir, {recursive:true});
  const logFile = path.join(logDir, service.id + '.log');
  const stream = fs.openSync(logFile, 'a');
  let child;
  try {
    child = spawnImpl(executable, [launch.entry, ...launch.args], {
      cwd:service.projectPath, env, detached:true, shell:false, windowsHide:true,
      stdio:['ignore',stream,stream]
    });
    if (!child.pid) fail('BACKEND_LAUNCH_FAILED', 4);
    child.unref();
  } finally { fs.closeSync(stream); }
  return {service:service.id, started:true, pid:child.pid, logFile, mode:'backend-only'};
}
async function probeAll(services,{env=process.env,fetchImpl=fetch}={}) {
  const report=[];
  for (const service of Object.values(services)) {
    if(!service.origin || !service.operations.health) {
      report.push({service:service.id,installed:service.installed,ok:false,
        status:'not_configured',reason:service.origin?'health_operation_missing':'service_origin_missing'});
      continue;
    }
    try {
      const result=await invoke(service,'health',{env,fetchImpl});
      report.push({service:service.id,installed:service.installed,ok:result.ok,
        status:result.ok?'healthy':'unhealthy',httpStatus:result.httpStatus});
    } catch(error) {
      report.push({service:service.id,installed:service.installed,ok:false,
        status:'unavailable',reason:error.message});
    }
  }
  return report;
}
async function main(args = process.argv.slice(2), io = console, env = process.env) {
  const root = rootDir(env), services = loadRegistry(root, env);
  const [verb, id, operation, ...extra] = args;
  if (verb === 'help' || !verb) {
    io.log('Usage: mvx-control list | doctor | commands <id> | status <id|all> | invoke <id> <operation> [payload-file] | start <id>');
    return 0;
  }
  if (verb === 'list') { io.log(JSON.stringify(show(services),null,2)); return 0; }
  if (verb === 'doctor') { io.log(JSON.stringify({schema:'mvx.tuios.doctor.v1',
    profile:env.MVX_TUIOS_PROFILE==='private'?'private':'restricted',
    services:show(services), configuration:configurationPath(root,env)},null,2)); return 0; }
  if (verb === 'status' && id === 'all') {
    const report=await probeAll(services,{env});
    io.log(JSON.stringify(report,null,2));
    return report.some(item=>item.status==='unhealthy'||item.status==='unavailable')?4:0;
  }
  if (!ID.test(id || '') || !services[id]) fail('UNKNOWN_SERVICE');
  const service = services[id];
  if (verb === 'commands') {
    io.log(JSON.stringify({id, operations:service.operations, launchConfigured:!!service.launch},null,2)); return 0;
  }
  if (verb === 'start') {
    io.log(JSON.stringify(startBackend(service,{root,env}),null,2)); return 0;
  }
  if (verb === 'status' || verb === 'invoke') {
    const op = verb === 'status' ? 'health' : operation;
    let payload = null;
    if (extra.length) {
      if (extra.length !== 1 || !inside(path.join(root,'contents'),path.resolve(extra[0])))
        fail('PAYLOAD_FILE_OUTSIDE_CONTENTS');
      payload = JSON.parse(fs.readFileSync(path.resolve(extra[0]), 'utf8'));
    }
    const result = await invoke(service, op, {env,payload});
    io.log(JSON.stringify(result,null,2));
    return result.ok ? 0 : 4;
  }
  fail('UNKNOWN_ACTION');
}
if (require.main === module) {
  main().then(code => { process.exitCode = code; })
    .catch(error => { console.error(JSON.stringify({ok:false,error:error.message})); process.exitCode = error.exitCode || 2; });
}
module.exports = {PROJECTS, inside, rootDir, configurationPath, validApiPath, loadRegistry, show,
  operationFor, invoke, validateLaunch, startBackend, probeAll, main};
