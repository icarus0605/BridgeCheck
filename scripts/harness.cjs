// 개발 검증 조정기. 로컬 증거는 신뢰된 작업자가 관리하며 인증·변조방지 저장소가 아닙니다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'output/harness');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function snapshot() {
  const names = ['index.html', 'contracts.html', 'README.md', '.gitignore', 'docs/02-prd.md', 'docs/03-context.md', 'docs/07-harness.md'];
  function walk(dir) {
    if (!fs.lstatSync(path.join(root,dir)).isDirectory()) throw new Error('검증 디렉터리가 일반 디렉터리가 아닙니다.');
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isSymbolicLink()) throw new Error('검증 범위의 심볼릭 링크는 지원하지 않습니다.');
      if (e.isDirectory()) walk(p); else if (e.isFile()) names.push(p);
    }
  }
  walk('scripts'); walk('samples');
  const files = Object.fromEntries(names.sort().map(p => {
    if (!fs.lstatSync(path.join(root,p)).isFile()) throw new Error('필수 파일이 일반 파일이 아닙니다.');
    return [p, sha(fs.readFileSync(path.join(root,p)))];
  }));
  return { digest: sha(JSON.stringify(files)), files };
}
function evaluate(current, run, reviews) {
  if (!run || run.version !== 1 || run.digest !== current.digest ||
      JSON.stringify(run.files) !== JSON.stringify(current.files)) return 'STALE_OR_MISSING_RUN';
  if (run.stable !== true || run.checks?.length !== 2 ||
      run.checks[0].name !== 'contract' || run.checks[1].name !== 'harness' ||
      !run.checks.every(c => c.passed === true)) return 'CHECKS_FAILED';
  if (!['Claude','Codex'].every(who => {
    const r=reviews.filter(item=>item && item.reviewer===who).at(-1);
    return r && r.recordedBy==='manual' && r.digest === current.digest && r.verdict === 'no-further-changes' &&
      typeof r.evidence === 'string' && r.evidence.trim().length > 20 &&
      typeof r.scope === 'string' && r.scope.trim().length > 10;
  })) return 'REVIEW_PENDING';
  return 'AWAITING_HUMAN_APPROVAL';
}
function check() {
  const before = snapshot();
  const checks = [['contract','scripts/verify.cjs'],['harness','scripts/harness.test.cjs']].map(([name,file]) => {
    const p = spawnSync(process.execPath, [file], {cwd:root,encoding:'utf8',timeout:15000,maxBuffer:64*1024});
    return {name,passed:!p.error && p.status === 0,exitCode:p.status,
      error:p.error?.code || null,truncated:p.error?.code==='ENOBUFS',stdout:(p.stdout || '').slice(0,65536),stderr:(p.stderr || '').slice(0,65536)};
  });
  const run = {version:1,id:crypto.randomUUID(),time:new Date().toISOString(),...before,
    stable:snapshot().digest === before.digest,checks};
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,`${run.id}.json`),JSON.stringify(run,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(out,'latest.json'),JSON.stringify(run,null,2)+'\n');
  console.log(JSON.stringify(run,null,2));
  if (!run.stable || !checks.every(c=>c.passed)) process.exitCode=1;
}
function read(file) { return JSON.parse(fs.readFileSync(path.join(out,file),'utf8')); }
function status() {
  let run=null,reviews=[];
  try { run=read('latest.json'); } catch {}
  try { reviews=read('reviews.json'); if(!Array.isArray(reviews)) reviews=[]; } catch {}
  const current=snapshot();
  const state=evaluate(current,run,reviews);
  console.log(JSON.stringify({state,digest:current.digest,humanApproval:'NOT_RECORDED',
    note:'커밋·푸시·배포를 실행하지 않습니다. 로컬 수동 검토 기록은 신원 인증이 아닙니다.'},null,2));
  // 0은 검증·검토 증거가 충족됨만 의미하며 배포 허가가 아닙니다.
  if(state!=='AWAITING_HUMAN_APPROVAL') process.exitCode=1;
}
if(require.main === module) {
  try {
    const command=process.argv[2];
    if(command==='check') check(); else if(command==='status') status();
    else throw new Error('사용법: node scripts/harness.cjs check|status');
  } catch(e) { console.error('HARNESS_BLOCKED:',e.message);process.exitCode=2; }
}
module.exports={snapshot,evaluate};
