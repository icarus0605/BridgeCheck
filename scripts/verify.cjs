// Node 내장 모듈만 사용하는 계약 규칙 검증입니다. DOM은 대역이며 실기기 검증이 아닙니다.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const nodes = {};
function node() {
  return {
    value: '', textContent: '', children: [], events: {},
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(event, handler) { this.events[event] = handler; },
    focus() {}, select() {}, remove() {}
  };
}
const context = {
  TextEncoder, assert, confirm:()=>true,
  document: { getElementById: id => nodes[id] ??= node(), createElement: tag => { const e=node(); if(tag==='textarea') Object.defineProperty(e,'type',{get:()=>'textarea',set:()=>{throw new TypeError('textarea.type is read-only');}}); return e; } },
  navigator: {},
  externalA: JSON.parse(fs.readFileSync(path.join(root, 'samples/contract-v1.json'))),
  externalB: JSON.parse(fs.readFileSync(path.join(root, 'samples/contract-v2.json')))
};
for(const id of ['requestPolicy','responsePolicy']){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const select=html.split('<select id="'+id+'">')[1].split('</select>')[0];
  assert.deepEqual([...select.matchAll(/<option value="([^"]+)">[^<]+<\/option>/g)].map(m=>m[1]),['unknown','ignore','reject']);
}
vm.createContext(context);
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8').split('<script>')[1].split('</script>')[0];
vm.runInContext(source, context);
let passed = 0;
function check(name, code) {
  vm.runInContext(`{ ${code} }`, context);
  passed++;
  console.log('PASS', name);
}
check('내장 샘플과 원본 계약 일치', `
  assert.equal(JSON.stringify(sampleA),JSON.stringify(externalA));
  assert.equal(JSON.stringify(sampleB),JSON.stringify(externalB));
`);
check('빠른 체험 3종과 실제 결과', `
  loadDemo('enum');assert.equal(reportContext.rows.length,1);assert.equal(reportContext.rows[0].status,'오류 가능');
  loadDemo('compatible');assert.equal(reportContext.rows.length,1);assert.equal(reportContext.rows[0].status,'계약상 호환');
  loadDemo('full');let rows=reportContext.rows;assert.equal(rows.length,8);
  assert.equal(rows.filter(r=>r.status==='오류').length,4);assert.equal(rows.filter(r=>r.status==='확인 필요').length,2);
  assert.equal($('proposals').children.length,7);
`);
check('세 방향의 미지 키 정책 및 필수 응답', `
  for(const g of groups)for(const policy of ['unknown','ignore','reject']){
    const a=JSON.parse(JSON.stringify(sampleA)),b=JSON.parse(JSON.stringify(a));
    b[g].push({name:'extra',type:'string',required:true});
    const row=compare(a,b,{request:policy,response:policy})[0];
    assert.equal(row.status,g==='requestFields'?{unknown:'확인 필요',ignore:'계약상 호환',reject:'오류'}[policy]:'오류');
  }
`);
check('required 방향과 타입/enum 중복 방지', `
  for(const g of groups){
    const a=JSON.parse(JSON.stringify(sampleA));a[g]=[{name:'f',type:'string',required:true,enum:['a','b']}];
    const b=JSON.parse(JSON.stringify(a));b[g][0].required=false;
    assert.equal(compare(a,b,{request:'unknown',response:'unknown'})[0].status,g==='requestFields'?'오류 가능':'계약상 호환');
    b[g][0].type='number';b[g][0].enum=[0];assert.equal(compare(a,b,{request:'unknown',response:'unknown'}).length,2);
  }
`);
check('enum 제약 생성/제거와 action 방향', `
  const a=JSON.parse(JSON.stringify(sampleA)),b=JSON.parse(JSON.stringify(a));delete b.requestFields[0].enum;
  assert.equal(compare(a,b,{request:'unknown',response:'unknown'})[0].status,'오류 가능');
  assert.equal(compare(b,a,{request:'unknown',response:'unknown'})[0].status,'계약상 호환');
  b.requestFields=a.requestFields;b.action='other';const rows=compare(a,b,{request:'unknown',response:'unknown'});
  assert.equal(rows.length,1);assert.equal(rows[0].g,'requestFields');
`);
check('입력 크기·JSON·미지원 속성·예약명 거부', `
  assert.throws(()=>parse('{PRIVATE','old'),/올바른 JSON/);
  assert.throws(()=>parse(' '.repeat(1048577),'old'),/MiB/);
  assert.throws(()=>parse('[]','old'));
  const a=JSON.parse(JSON.stringify(sampleA));a.requestFields[0].name='__proto__';assert.throws(()=>parse(JSON.stringify(a),'old'));
  a.requestFields[0].name='quality';a.requestFields[0].maxLength=5;assert.throws(()=>parse(JSON.stringify(a),'old'),/미지원/);
`);
check('대상 변경 시 판정과 대응 제안 보존', `
  loadDemo('full');const before=JSON.stringify(reportContext.rows);
  const select=$('proposals').children[0].children[1];select.value='app';select.onchange();
  for(const target of ['android','ios','common']){
    $('reportTarget').value=target;$('reportTarget').onchange();
    assert.equal(reportContext.choices[0],'app');assert.equal(JSON.stringify(reportContext.rows),before);
    assert.ok($('report').value.includes('선택한 제안: 앱 변경 검토'));
  }
`);
check('정책/입력 변경·오류·초기화 시 오래된 결과 제거', `
  $('requestPolicy').events.input();assert.equal(reportContext,null);assert.equal($('report').value,'');
  run();assert.equal(Object.keys(reportContext.choices).length,0);
  $('new').value='{';$('new').events.input();run();assert.equal(reportContext,null);
  $('reportTarget').onchange();assert.equal($('report').value,'');
  $('reset').onclick();assert.equal($('reportTarget').value,'common');assert.equal($('proposals').children.length,0);
`);
check('민감값 마스킹과 Markdown 펜스 탈출 방지', `
  const a=JSON.parse(JSON.stringify(sampleA)),b=JSON.parse(JSON.stringify(sampleA));
  a.requestFields.push({name:'apiKey',type:'string',enum:['PRIVATE_OLD']});b.requestFields.push({name:'apiKey',type:'string',enum:['PRIVATE_NEW']});
  $('old').value=JSON.stringify(a);$('new').value=JSON.stringify(b);run();
  for(const target of ['common','android','ios']){$('reportTarget').value=target;refreshReport();assert.ok(!$('report').value.includes('PRIVATE_'));assert.ok(reportMarkdown($('report').value).includes('[MASKED]'));}
  const input=String.fromCharCode(96).repeat(5)+'\\n<img src=x>';
  const output=reportMarkdown(input);assert.ok(output.includes(String.fromCharCode(96).repeat(6)+'text'));assert.ok(output.includes(input));
`);
check('예상 밖 예외의 내부 문자열 비노출', `
  const saved=compare;compare=()=>{throw new Error('PRIVATE_DETAIL')};run();compare=saved;
  assert.equal($('status').textContent,'점검 중 문제가 발생했습니다. 입력을 확인하세요.');assert.equal($('report').value,'');
`);


check('이전 계약 복사·취소·잘못된 원본 보존', `
  loadDemo('full');const old=$('old').value,newer=$('new').value;
  confirm=()=>false;$('copyOld').onclick();assert.equal($('new').value,newer);assert.ok(reportContext);
  confirm=()=>true;$('copyOld').onclick();assert.equal($('new').value,old);assert.equal(reportContext,null);
  $('old').value='{';$('copyOld').onclick();assert.equal($('new').value,old);
`);
check('도우미 왕복·enum 타입 검증·실패시 원본 보존', `
  fillBuilder(sampleA);assert.equal(JSON.stringify(builderContract()),JSON.stringify(sampleA));
  $('builderTarget').value='new';const before=$('new').value;
  builderRows.requestFields[0].values.value='PRIVATE_RAW';$('builderApply').onclick();
  assert.equal($('new').value,before);assert.ok(!$('builderStatus').textContent.includes('PRIVATE_RAW'));
  builderRows.requestFields[0].values.value='[0]';assert.throws(()=>builderContract(),/enum/);
  builderRows.requestFields[0].values.value='["low","high","medium"]';confirm=()=>false;$('builderApply').onclick();assert.equal($('new').value,before);assert.ok($('builderStatus').textContent.includes('취소'));confirm=()=>true;
  builderRows.requestFields[0].values.value='["low","high","medium"]';$('builderApply').onclick();
  assert.equal(JSON.parse($('new').value).requestFields[0].enum.length,3);assert.equal(reportContext,null);
  builderRows.requestFields[0].name.value='__proto__';assert.throws(()=>builderContract());
  const large=JSON.parse(JSON.stringify(sampleA));large.requestFields=Array.from({length:151},(_,i)=>({name:'f'+i,type:'string'}));
  assert.throws(()=>fillBuilder(large),/150/);
`);
check('결과 버튼·다음 행동·초기화 시 도우미 제거', `
  clear();assert.equal($('copy').disabled,true);assert.equal($('download').disabled,true);
  loadDemo('enum');assert.equal($('download').disabled,false);assert.ok($('nextStep').textContent.includes('확인할 변경 1건'));
  $('reset').onclick();assert.equal($('download').disabled,true);assert.equal($('builderAction').value,'');assert.equal(builderRows.requestFields.length,0);
`);
check('협업 메모 대상별 출력·규격 합의·판정 독립', `
 loadDemo('enum');const before=JSON.stringify(reportContext.rows);
 const data=reportContext.coordination[0];Object.assign(data,{androidOwner:'A_OWNER',iosOwner:'I_OWNER',androidStatus:'released',iosStatus:'working',androidDate:'2026-11-01',iosDate:'2026-11-02'});
 Object.assign(reportContext.spec,{androidSpec:'quality:string',iosSpec:'imageQuality:string',commonSpec:'quality:string 공통',coordinator:'SPEC_OWNER',agreement:'agreed'});
 for(const target of ['android','ios','common']){
  $('reportTarget').value=target;refreshReport();const text=$('report').value;
  assert.equal(text.includes('A_OWNER'),target!=='ios');assert.equal(text.includes('I_OWNER'),target!=='android');
  assert.ok(text.includes('imageQuality:string'));assert.ok(text.includes('SPEC_OWNER'));assert.ok(text.includes('마스킹 미적용'));
  assert.ok(text.indexOf('1. 먼저 확인할 항목')<text.indexOf('4. 상세 비교 근거'));
  assert.equal(JSON.stringify(reportContext.rows),before);
 }
`);
check('협업 입력 상한·펜스·재점검 보존·삭제와 재등장 차단', `
 loadDemo('enum');const form=$('proposals').children[0].children[2];assert.ok(!form.open);
 const owner=form.children[2].children[0].children[0];owner.value='A_OWNER';owner.oninput();
 owner.value='x'.repeat(121);owner.oninput();assert.equal(reportContext.coordination[0].androidOwner,'A_OWNER');assert.equal(owner.value,'A_OWNER');
 const spec=$('specForm').children[0].children[2].children[0].children[0];spec.value=String.fromCharCode(96).repeat(5)+'<img src=x>';spec.oninput();
 assert.ok(reportMarkdown($('report').value).includes(String.fromCharCode(96).repeat(6)+'text'));
 spec.value='x'.repeat(1001);spec.oninput();assert.ok(reportContext.spec.androidSpec.length<1001);
 $('old').events.input();assert.equal($('report').value,'');assert.equal($('download').disabled,true);run();
 assert.equal(reportContext.coordination[0].androidOwner,'A_OWNER');assert.equal(reportContext.inherited,true);assert.ok($('report').value.includes('재확인 필요'));
 const changed=JSON.parse($('new').value);changed.requestFields[0].enum=['low','high'];$('new').value=JSON.stringify(changed);run();assert.equal(Object.keys(reportContext.coordination).length,0);
 changed.requestFields[0].enum.push('medium');$('new').value=JSON.stringify(changed);run();assert.equal(reportContext.coordination[0].androidOwner,undefined);
 const original=JSON.parse($('old').value);original.action='other';$('old').value=JSON.stringify(original);run();assert.equal(Object.keys(reportContext.spec).length,0);
`);
check('초기화·샘플 취소 보존 및 확정 시 메모 제거', `
 loadDemo('enum');reportContext.coordination[0].androidOwner='KEEP';refreshReport();
 confirm=()=>false;loadDemo('full');assert.equal(reportContext.coordination[0].androidOwner,'KEEP');$('reset').onclick();assert.ok(reportContext);
 confirm=()=>true;$('reset').onclick();assert.equal(memoCache,null);assert.equal(reportContext,null);assert.equal($('specForm').children.length,0);
 loadDemo('enum');assert.equal(reportContext.coordination[0].androidOwner,undefined);
`);
(async()=>{
  await vm.runInContext(`(async()=>{
    const valid=JSON.stringify(sampleA);$('old').value=valid;
    await importContract('old',{size:3,text:async()=>'{'});assert.equal($('old').value,valid);
    let read=false;await importContract('old',{size:1048577,text:async()=>{read=true;return valid;}});assert.equal(read,false);
    await importContract('new',{size:valid.length,text:async()=>valid});assert.equal($('new').value,valid);
    let finish;const pending=importContract('new',{size:1,text:()=>new Promise(resolve=>finish=resolve)});
    $('new').value='MANUAL_EDIT';$('new').events.input();finish(valid);await pending;assert.equal($('new').value,'MANUAL_EDIT');
    let first;const earlier=importContract('new',{size:1,text:()=>new Promise(resolve=>first=resolve)});
    await importContract('new',{size:valid.length,text:async()=>valid});first(JSON.stringify(sampleB));await earlier;assert.equal($('new').value,valid);
    let resetRead;const last=importContract('old',{size:1,text:()=>new Promise(resolve=>resetRead=resolve)});
    $('reset').onclick();resetRead(valid);await last;assert.equal($('old').value,'');
  })()`,context);
  passed++;console.log('PASS 파일 입력 검증·크기 선검사·편집/연속선택/초기화 경합');
  console.log(`${passed} 검증 묶음 통과. 브라우저·실기기 검증을 대체하지 않습니다.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
