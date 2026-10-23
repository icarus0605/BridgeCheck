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
    focus() {}, select() {}
  };
}
const context = {
  TextEncoder, assert,
  document: { getElementById: id => nodes[id] ??= node(), createElement: node },
  navigator: {},
  externalA: JSON.parse(fs.readFileSync(path.join(root, 'samples/contract-v1.json'))),
  externalB: JSON.parse(fs.readFileSync(path.join(root, 'samples/contract-v2.json')))
};
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
console.log(`${passed} 검증 묶음 통과. 브라우저·실기기 검증을 대체하지 않습니다.`);
