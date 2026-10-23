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
    focus() {}, select() {}, remove() {}, showModal() { this.open=true; }, close() { this.open=false; }
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
check('일괄 담당자 빈칸·전체 변경·취소·새 행과 scope 수명', `
 loadDemo('full');const rows=JSON.stringify(reportContext.rows);
 reportContext.owners={android:'A_DEFAULT',ios:'I_DEFAULT',coordinator:'C_DEFAULT'};
 reportContext.coordination[0].androidOwner='INDIVIDUAL';applyOwners('empty');
 assert.equal(reportContext.coordination[0].androidOwner,'INDIVIDUAL');assert.equal(reportContext.coordination[0].iosOwner,'I_DEFAULT');assert.equal(reportContext.spec.coordinator,'C_DEFAULT');
 assert.ok(Object.values(reportContext.coordination).every(d=>d.iosOwner==='I_DEFAULT'));
 confirm=()=>false;applyOwners('all');assert.equal(reportContext.coordination[0].androidOwner,'INDIVIDUAL');confirm=()=>true;applyOwners('all');assert.equal(reportContext.coordination[0].androidOwner,'A_DEFAULT');assert.equal(JSON.stringify(reportContext.rows),rows);
 reportContext.owners.android='';applyOwners('all');assert.equal(reportContext.coordination[0].androidOwner,'A_DEFAULT');
 reportContext.owners.android='A_DEFAULT';const b=JSON.parse($('new').value);b.requestFields.push({name:'fresh',type:'string'});$('new').value=JSON.stringify(b);run();const fresh=reportContext.rows.findIndex(r=>r.name==='fresh');assert.equal(reportContext.coordination[fresh].androidOwner,undefined);assert.equal(reportContext.owners.android,'A_DEFAULT');
 b.action='newScope';$('new').value=JSON.stringify(b);run();assert.equal(Object.keys(reportContext.owners).length,0);
 loadDemo('enum');assert.equal(Object.keys(reportContext.owners).length,0);reportContext.owners.android='DRAFT_ONLY';run();assert.equal(reportContext.inherited,false);assert.ok(!$('report').value.includes('DRAFT_ONLY'));
`);
check('일정 날짜 검증·경계·플랫폼 필터·역전 미보정·전체월 보고서', `
 assert.equal(validDate('2028-02-29'),true);assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2100-02-29'),false);assert.equal(validDate('2000-02-29'),true);
 for(const d of ['2026-13-01','2026-04-31','0999-01-01','10000-01-01','2026-1-01'])assert.equal(validDate(d),false);
 loadDemo('enum');const data=reportContext.coordination[0];Object.assign(data,{androidDevDate:'2026-10-31',androidQaDate:'2026-11-01',androidDate:'2026-10-30',iosDevDate:'2026-12-01',iosDate:'2026-12-03'});
 $('reportTarget').value='android';$('calendarMonth').value='2026-10';refreshReport();
 assert.equal(scheduleEvents().length,3);assert.ok(scheduleEvents().every(e=>e.platform==='android'));assert.equal(scheduleWarnings().length,1);assert.equal(data.androidDate,'2026-10-30');assert.ok($('report').value.includes('2026-11-01'));assert.ok(!$('report').value.includes('2026-12-01'));
 assert.ok($('scheduleWarnings').children.length===1);assert.ok($('report').value.includes('담당자 확인 필요'));
 const october=$('scheduleCalendar').children[0];const firstWeek=october.children[2].children[0];assert.equal(firstWeek.children[4].children[0].children[0].textContent,'1');
 assert.ok($('scheduleStatus').textContent.includes('2026-10 2건'));changeMonth(1);assert.equal($('calendarMonth').value,'2026-11');assert.ok($('scheduleStatus').textContent.includes('2026-11 1건'));
 $('reportTarget').value='ios';refreshReport();assert.equal(scheduleEvents().length,2);assert.equal(scheduleWarnings().length,0);$('firstSchedule').onclick();assert.equal($('calendarMonth').value,'2026-12');
 $('calendarMonth').value='9999-12';changeMonth(1);assert.equal($('calendarMonth').value,'9999-12');$('calendarMonth').value='1000-01';changeMonth(-1);assert.equal($('calendarMonth').value,'1000-01');
`);
check('달력 선택일·월 전체·무효화 및 날짜 입력 거부', `
 loadDemo('enum');reportContext.coordination[0].androidDate='2026-10-23';$('calendarMonth').value='2026-10';refreshReport();
 const table=$('scheduleCalendar').children[0],button=table.children[2].children[3].children[5].children[0];button.onclick();assert.equal(selectedDay,'2026-10-23');assert.equal($('scheduleList').children.length,2);$('wholeMonth').onclick();assert.equal(selectedDay,'');
 const form=$('proposals').children[0].children[2],dateField=form.children[2].children[2].children[0];dateField.value='2026-02-30';dateField.oninput();assert.equal(reportContext.coordination[0].androidDevDate,undefined);assert.ok($('copyStatus').textContent.includes('올바른 날짜'));
 $('old').events.input();assert.equal($('schedulePanel').hidden,true);assert.equal($('scheduleList').children.length,0);assert.equal($('ownerForm').children.length,0);
`);
check('요약 우선3건·전체내용 유지·선택플랫폼 담당자 빈칸 수', `
 loadDemo('full');let stats=briefStats();assert.equal(stats.risks.length,7);assert.equal(stats.pending,7);assert.equal(stats.missing,14);assert.ok(stats.risks.slice(0,3).every(({r})=>r.status==='오류'));
 let digest=briefDigestLines().join('\\n');assert.equal(digest.split('• ').length-1,3);assert.ok(digest.includes('전체 7건'));assert.equal(reportContext.rows.length,8);
 const box=$('reportBrief'),list=box.children.find(n=>n.className==='brief-toplist');assert.equal(list.children.length,3);const detail=box.children.find(n=>n.children?.[0]?.textContent==='전체 7건 · 이유·담당자·운영 일정 보기');assert.ok(detail);assert.ok(!detail.open);
 const allDetails=detail.children.map(n=>n.textContent||'').join('');const reportPart3=$('report').value.split('3. 변경별 대응 제안')[1].split('4. 상세 비교 근거')[0];assert.equal(reportPart3.split('선택한 제안:').length-1,7);for(const {r} of stats.risks){assert.ok(allDetails.includes(briefLabel(r)));assert.ok(reportPart3.includes((directions[r.g]||'')+' / '+rowPath(r)));}assert.notEqual(briefLabel(stats.risks[0].r),briefLabel(stats.risks[1].r));
 reportContext.owners.android='A_OWNER';applyOwners('empty');$('reportTarget').value='android';refreshReport();assert.equal(briefStats().missing,0);$('reportTarget').value='ios';refreshReport();assert.equal(briefStats().missing,7);
 const last=stats.risks[6];assert.ok($('report').value.includes(rowPath(last.r)));reportContext.choices[last.i]='web';refreshReport();assert.equal(briefStats().pending,6);
 loadDemo('compatible');assert.equal(briefStats().risks.length,0);assert.equal(briefStats().missing,0);assert.ok(briefDigestLines().join('').includes('실제 앱 검증'));
`);
check('오류 항목 선택·메모 유지·전체 보고서·무효화', `
 loadDemo('full');assert.equal(proposalPanels.length,7);assert.equal(proposalPanels.filter(x=>!x.box.hidden).length,1);assert.equal(selectedRisk,0);
 reportContext.coordination[0]={androidOwner:'KEEP'};reportContext.choices[0]='app';selectRisk('5');assert.equal(selectedRisk,5);assert.equal(proposalPanels.find(x=>x.i===5).box.hidden,false);assert.equal(proposalPanels.find(x=>x.i===0).box.hidden,true);
 renderProposals();assert.equal(selectedRisk,5);selectRisk('0');assert.equal(reportContext.coordination[0].androidOwner,'KEEP');assert.equal(reportContext.choices[0],'app');refreshReport();assert.ok($('report').value.includes('KEEP'));assert.ok($('report').value.includes('thumbnailUrl'));
 selectRisk('invalid');assert.equal(selectedRisk,0);clear();assert.equal(selectedRisk,null);assert.equal($('riskPicker').hidden,true);loadDemo('compatible');assert.equal($('riskPicker').hidden,true);assert.equal(proposalPanels.length,0);
`);
check('화면 전환·메모 보존·무효 결과 접근 차단', `
 loadDemo('full');assert.equal(currentScreen,'Result');assert.equal($('screenInput').hidden,true);assert.equal($('navReport').disabled,false);
 reportContext.coordination[0]={androidOwner:'KEEP'};const before=$('old').value;showScreen('Report');assert.equal($('screenReport').hidden,false);showScreen('Input');assert.equal(reportContext.coordination[0].androidOwner,'KEEP');assert.equal($('old').value,before);
 $('resultReportLink').onclick({preventDefault(){}});assert.equal(currentScreen,'Report');clear();assert.equal(currentScreen,'Input');assert.equal($('navReport').disabled,true);showScreen('Report');assert.equal(currentScreen,'Input');
 $('old').value='invalid';run();assert.equal(currentScreen,'Input');assert.equal(reportContext,null);
`);
check('선택창 담당자 적용 범위·취소·입력검증·context 무효화', `
 loadDemo('full');reportContext.owners.android='BASE';reportContext.spec.coordinator='COORD';openOwnerPicker();assert.equal(ownerPickerRows.length,7);assert.equal($('ownerPicker').open,true);assert.equal($('pickerApply').disabled,true);
 $('pickerAndroid').value='DRAFT';$('pickerCancel').onclick();assert.equal(reportContext.owners.android,'BASE');assert.equal(reportContext.coordination[0].androidOwner,undefined);
 openOwnerPicker();$('pickerAndroid').value='DRAFT';$('ownerPicker').oncancel({preventDefault(){}});assert.equal($('ownerPicker').open,false);assert.equal(reportContext.owners.android,'BASE');
 openOwnerPicker();applySelectedOwners();assert.ok($('pickerStatus').textContent.includes('하나 이상'));$('pickerAll').onclick();assert.equal(ownerPickerRows.filter(x=>x.checkbox.checked).length,7);$('pickerNone').onclick();assert.equal(ownerPickerRows.filter(x=>x.checkbox.checked).length,0);
 ownerPickerRows[0].checkbox.checked=true;ownerPickerRows[2].checkbox.checked=true;const indices=ownerPickerRows.filter(x=>x.checkbox.checked).map(x=>x.i);
 $('pickerAndroid').value='';$('pickerIos').value='';applySelectedOwners();assert.ok($('pickerStatus').textContent.includes('담당자를 입력'));$('pickerAndroid').value='x'.repeat(121);applySelectedOwners();assert.ok($('pickerStatus').textContent.includes('120자'));$('pickerAndroid').value='SELECTED';applySelectedOwners();
 assert.equal($('ownerPicker').open,false);assert.equal(reportContext.owners.android,'SELECTED');assert.equal(reportContext.spec.coordinator,'COORD');for(const [i,d] of Object.entries(reportContext.coordination))assert.equal(d.androidOwner,indices.includes(+i)?'SELECTED':undefined);
 openOwnerPicker();ownerPickerRows[0].checkbox.checked=true;$('pickerAndroid').value='OVERWRITE';$('pickerMode').value='empty';applySelectedOwners();assert.equal(reportContext.coordination[0].androidOwner,'SELECTED');$('pickerMode').value='all';pickerCount();assert.ok($('pickerStatus').textContent.includes('기존 개별 입력 1곳'));assert.equal($('pickerApply').disabled,false);applySelectedOwners();assert.equal(reportContext.coordination[0].androidOwner,'OVERWRITE');assert.equal(reportContext.coordination[indices[1]].androidOwner,'SELECTED');
 openOwnerPicker();$('old').events.input();assert.equal($('ownerPicker').open,false);assert.equal(ownerPickerContext,null);applySelectedOwners();assert.equal(reportContext,null);
 loadDemo('compatible');openOwnerPicker();assert.equal($('ownerPicker').open,false);
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
