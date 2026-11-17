import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const fail = message => { throw new Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const timestamp = value => {
  if (!nonempty(value) || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('Timestamp must include timezone');
  return Date.parse(value);
};

// Checks report consistency only. It cannot establish that an observer actually
// used a physical device, or replace independent QA/owner acceptance.
export function validateFieldRun(plan, run) {
  if (plan.schemaVersion !== 1 || run.schemaVersion !== 1 || run.planIssue !== plan.issue) fail('Unknown plan/report version');
  if (!nonempty(run.runId) || !nonempty(run.executor) || !/^[a-f0-9]{7,40}$/.test(run.commit || '')) fail('Run identity, executor and commit required');
  const start = timestamp(run.startedAt), end = timestamp(run.endedAt);
  if (end < start) fail('Run ends before it starts');
  const device = plan.devices.find(d => d.id === run.device?.id);
  if (!device || device.kind !== run.device.kind) fail('Device type differs from plan: emulation cannot claim physical evidence');
  for (const key of ['model','osVersion','browser','browserVersion','viewport','orientation','displayMode']) if (!nonempty(run.device[key])) fail('Device metadata missing: ' + key);
  if (device.browser && device.browser !== run.device.browser) fail('Browser differs from planned target');
  if (!['synthetic','owner-real-session'].includes(run.data)) fail('Unknown data scope');
  if (run.data === 'owner-real-session' && !nonempty(run.ownerAuthorization)) fail('Owner session needs explicit provenance; not an automated QA fixture');
  if (!Array.isArray(run.results) || run.results.length === 0) fail('An empty template is not a completed run');
  const ids = new Set(), totals = {pass:0, fail:0, blocked:0, 'not-run':0};
  for (const result of run.results) {
    const item = plan.cases.find(c => c.id === result.caseId);
    if (!item || ids.has(result.caseId)) fail('Unknown or duplicate case');
    ids.add(result.caseId);
    if (!item.targets.includes(device.id)) fail('Case is not applicable to this target');
    if (!Object.hasOwn(totals,result.status)) fail('Unknown result status');
    totals[result.status]++;
    if (!nonempty(result.actual)) fail('Actual outcome/reason is required');
    if (['blocked','not-run'].includes(result.status)) {
      if (!nonempty(result.nextAction)) fail('Blocked/not-run result needs next action');
      continue;
    }
    if (run.data !== item.data) fail('Personal session cannot stand in for synthetic QA or vice versa');
    const a = timestamp(result.startedAt), b = timestamp(result.endedAt);
    if (a < start || b > end || b < a) fail('Case timing falls outside run');
    const elapsed = (b-a)/1000;
    if (!Number.isFinite(result.activeSeconds) || result.activeSeconds < 0 || result.activeSeconds > elapsed) fail('Active time cannot exceed observed interval');
    if (!Number.isInteger(result.taps) || result.taps < 0 || !Array.isArray(result.errors)) fail('Record taps and errors explicitly');
    if (!plan.themes.includes(result.theme)) fail('Unknown/missing theme');
    if (!Array.isArray(result.evidence) || !result.evidence.length || result.evidence.some(e => !nonempty(e.ref) || !['screenshot','history','observation','measurement'].includes(e.kind))) fail('Evidence reference required');
    if (result.status === 'fail' && !nonempty(result.defect)) fail('Failure requires defect reference or description');
    if (result.status !== 'pass') continue;
    if (result.errors.length) fail('Pass cannot conceal unresolved errors');
    if ((item.durationBasis === 'elapsed' ? elapsed : result.activeSeconds) < item.minSeconds) fail('Required duration not observed');
    if (item.maxTaskSeconds !== null && elapsed > item.maxTaskSeconds) fail('Task exceeds agreed maximum duration');
    for (const [key,value] of Object.entries(item.requires)) {
      const observed = result.observations?.[key];
      if (key === 'mutationCount' && observed !== value) fail('Exactly ten mutations required; extra operations are not a pass');
      if (['outageSeconds','delaySinceTargetSeconds'].includes(key) && Number.isFinite(observed) && observed > elapsed) fail('Observed subinterval exceeds case duration');
      if (typeof value === 'number' ? !Number.isFinite(observed) || observed < value : observed !== value) fail('Required observation missing: ' + key);
    }
  }
  return {valid:true, totals, scope:'report-consistency-only', planAccepted:false, milestoneAccepted:false,
    unreportedCases:plan.cases.filter(c => c.targets.includes(device.id) && !ids.has(c.id)).map(c => c.id)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) fail('Usage: node scripts/verify-field-run.mjs <private-report.json>');
    const plan = JSON.parse(readFileSync(new URL('../docs/qa/field-acceptance-plan.json',import.meta.url),'utf8'));
    const report = JSON.parse(readFileSync(process.argv[2],'utf8'));
    console.log(JSON.stringify(validateFieldRun(plan,report),null,2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
