/* Local-only bounded bridge-name review. No uploaded source is executed. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.BridgeCheck=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const platforms=['Android','iOS','React'];
const statuses=['미정','검토 중','수정 중','검증 중','완료(담당자 입력)'];
const editable=['담당자','수정 내용','개발 예정일','QA 예정일','운영 예정일','진행 상태'];
const columns=['항목 키','분석 ID','기능명','플랫폼','점검 대상','결과','수정 위치','검토 제안',...editable];
function tokens(source){
  const out=[];out.warnings=[];let i=0,line=1;
  const advance=()=>{if(source[i]==='\n')line++;return source[i++];};
  while(i<source.length){
    const c=source[i];if(/\s/.test(c)){advance();continue;}
    if(source.slice(i,i+2)==='//'){while(i<source.length&&source[i]!=='\n')advance();continue;}
    if(source.slice(i,i+2)==='/*'){advance();advance();let depth=1;while(i<source.length&&depth){if(source.slice(i,i+2)==='/*'){depth++;advance();advance();}else if(source.slice(i,i+2)==='*/'){depth--;advance();advance();}else advance();}if(depth)out.warnings.push('닫히지 않은 주석');continue;}
    const start=line;
    if((c==='/'&&source[i+1]!=='>'&&out.at(-1)?.v!=='<')||c==='`'||(c==='#'&&source[i+1]==='"')||source.slice(i,i+3)==='"""'){out.warnings.push('정규식/나눗셈·템플릿·raw·다중행 문자열은 지원하지 않아 파일을 제외했습니다.');return out;}
    if(c==='"'||c==="'"||c==='`'){
      const triple=source.slice(i,i+3)===c.repeat(3),q=triple?c.repeat(3):c;for(let n=0;n<q.length;n++)advance();
      let value='',complex=triple||c==='`',closed=false;
      while(i<source.length){if(source.slice(i,i+q.length)===q){for(let n=0;n<q.length;n++)advance();closed=true;break;}if(source[i]==='\\'){complex=true;advance();if(i<source.length)advance();}else{value+=advance();}}
      if(value.includes('$'))complex=true;if(!closed)out.warnings.push('닫히지 않은 문자열');
      out.push({v:value,k:closed&&!complex?'str':'opaque',line:start});continue;
    }
    if(/[A-Za-z_$]/.test(c)){let v='';while(i<source.length&&/[\w$]/.test(source[i]))v+=advance();out.push({v,k:'id',line:start});continue;}
    out.push({v:advance(),k:'sym',line:start});
  }return out;
}
const literal=t=>t&&t.k==='str'&&t.v.length>0&&t.v.length<=160;
function extract(file,platform){
  const t=tokens(file.text),evidence=[],anchors=[];if(t.warnings.length)return {evidence,anchors,warnings:t.warnings};
  const v=i=>t[i]?.v;
  const dispatchEnd=i=>['action','command','method'].includes(v(i))?i+1:platform==='iOS'&&v(i)==='message'&&v(i+1)==='.'&&v(i+2)==='name'?i+3:-1;
  function add(i,kind,pattern){if(literal(t[i])&&v(i+1)!=='+'&&v(i-1)!=='+')evidence.push({name:v(i),kind,path:file.path,line:t[i].line,pattern});}
  function named(i,kind,pattern){if(t[i]?.k==='id')evidence.push({name:v(i),kind,path:file.path,line:t[i].line,pattern});}
  for(let i=0;i<t.length;i++){
    if(['JavascriptInterface','userContentController','callBridge','invokeBridge','messageHandlers','postMessage'].includes(v(i)))anchors.push({path:file.path,line:t[i].line});
    if(platform==='React'){
      if(['callBridge','invokeBridge'].includes(v(i))&&v(i+1)==='('&&[',',')'].includes(v(i+3)))add(i+2,'action','Bridge 호출 인수');
      if(v(i)==='window'&&v(i+1)==='.'&&v(i+2)==='Android'&&v(i+3)==='.'&&v(i+5)==='(')named(i+4,'action','window.Android 직접 호출');
      if(v(i)==='postMessage'&&v(i+1)==='('&&v(i+2)==='{'){
        for(let j=i+3;j<Math.min(i+30,t.length)&&v(j)!=='}';j++)if(v(j)==='action'&&v(j+1)===':'&&[',','}'].includes(v(j+3)))add(j+2,'action','postMessage action');
      }
      if(['addEventListener','on'].includes(v(i))&&v(i+1)==='('&&v(i+3)===',')add(i+2,'response','이벤트 수신');
    }else{
      if(platform==='Android'&&v(i)==='@'&&v(i+1)==='JavascriptInterface'){
        for(let j=i+2;j<Math.min(i+60,t.length);j++){
          if(v(j)==='@'){j++;while(t[j+1]?.k==='id'||v(j+1)==='.')j++;if(v(j+1)==='('){j+=2;let depth=1;while(j<t.length&&depth){if(v(j)==='(')depth++;if(v(j)===')')depth--;j++;}j--;}continue;}
          if(v(j)==='fun'&&v(j+2)==='('){named(j+1,'action','@JavascriptInterface Kotlin 메서드');break;}
          if(v(j)==='('&&t[j-1]?.k==='id'){named(j-1,'action','@JavascriptInterface Java 메서드');break;}
          if(v(j)==='{'||v(j)===';')break;
        }
      }
      // Only literal equality against explicitly named action/command/method variables.
      const end=dispatchEnd(i);if(end>=0&&v(end)==='='&&v(end+1)==='='&&[ ')','{','&','|',':'].includes(v(end+3)))add(end+2,'action','디스패치 이름 비교 분기');
      // Switch/when body tied to a named dispatch variable, not arbitrary case strings.
      if(['switch','when'].includes(v(i))){
        let j=i+1;if(v(j)==='(')j++;j=dispatchEnd(j);if(j<0)continue;if(v(j)===')')j++;if(v(j)!=='{')continue;
        let depth=1;for(j++;j<t.length&&depth;j++){if(v(j)==='{')depth++;if(v(j)==='}')depth--;if(depth===1){if(v(j)==='case'&&v(j+2)===':')add(j+1,'action','switch action 분기');if(literal(t[j])&&v(j+1)==='-'&&v(j+2)==='>')add(j,'action','when action 분기');}}
      }
      if(['sendEvent','emit','emitEvent'].includes(v(i))&&v(i+1)==='('&&[',',')'].includes(v(i+3)))add(i+2,'response','이벤트 발신 호출');
    }
  }
  return {evidence:evidence.filter((e,i,a)=>a.findIndex(x=>x.name===e.name&&x.kind===e.kind&&x.line===e.line)===i),anchors:anchors.slice(0,3),warnings:[]};
}
function specRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>500)throw Error('명세서는 1~500개 기능이 필요합니다.');
 const seen=new Set();return rows.map((r,i)=>{const action=String(r.action??r['기능명']??'').trim(),responseEvent=String(r.responseEvent??r['응답 이벤트']??'').trim();
 for(const x of [action,responseEvent])if(x.length>160||/[\x00-\x1f]/.test(x))throw Error(`${i+2}행: 기능명 또는 이벤트 이름이 올바르지 않습니다.`);
 if(!action||seen.has(action))throw Error(`${i+2}행: 기능명이 없거나 중복됩니다.`);seen.add(action);return {action,responseEvent};});
}
function analyze(spec,files){
 spec=specRows(spec);const active=platforms.filter(p=>files.some(f=>f.platform===p));if(!active.length)throw Error('Android·iOS·React 코드 중 하나 이상을 선택해 주세요.');
 const extracted={};for(const p of platforms)extracted[p]=files.filter(f=>f.platform===p).map(f=>extract(f,p));
 const rows=[];
 function row(action,p,kind,name,extra=false){const all=extracted[p].flatMap(x=>x.evidence),found=all.filter(e=>e.kind===kind&&e.name===name);const anchors=extracted[p].flatMap(x=>x.anchors).slice(0,3);
 const similar=found.length?[]:all.filter(e=>e.kind===kind&&e.name.replace(/[_\s]/g,'').toLowerCase()===name.replace(/[_\s]/g,'').toLowerCase());
 const excluded=extracted[p].length>0&&extracted[p].every(x=>x.warnings.length);
 const result=excluded?'분석 못 함·직접 확인':extra?'명세에 없음':found.length?'코드에 있음·동작 미확인':similar.length?'이름 불일치·오타 의심':'코드에 없음·누락 의심';
 const at=(path,line)=>`${path} ${line}번째 줄`;
 const position=found.length?found.map(e=>`${at(e.path,e.line)} (${e.pattern})`).join('\n'):similar.length?similar.map(e=>`${at(e.path,e.line)} (비슷한 이름: ${e.name})`).join('\n'):anchors.length?'여기서부터 살펴보세요(정확한 수정 위치 아님): '+anchors.map(a=>at(a.path,a.line)).join(', '):'관련 코드를 찾지 못했습니다. Bridge 코드가 든 파일을 올렸는지 확인하세요.';
 const advice=excluded?'지원하지 않는 문법이 있어 이 플랫폼 파일을 건너뛰었습니다. 파일을 직접 열어 확인하세요.':extra?'실제로 쓰는 기능이면 명세서에 추가하고, 쓰지 않는 코드라면 지우세요.':found.length?'급하지 않습니다. 필요하면 위치를 열어 호출 방식과 주고받는 값이 명세와 맞는지 확인하세요.':similar.length?'명세와 코드 중 어느 이름이 맞는지 정하고 한쪽으로 맞추세요.':'이 기능이 빠졌는지, 이름이 바뀌었는지 담당 개발자에게 확인하세요. 다른 파일에 있다면 그 파일도 올려 다시 점검하세요.';
 rows.push({'항목 키':JSON.stringify([action,p,kind,name,extra?'extra':'spec']),'분석 ID':'','기능명':action,'플랫폼':p,'점검 대상':`${kind==='action'?'기능':'응답 이벤트'}: ${name}`,'결과':result,'수정 위치':position,'검토 제안':advice,'담당자':'','수정 내용':'','개발 예정일':'','QA 예정일':'','운영 예정일':'','진행 상태':'미정'});
 }
 for(const s of spec)for(const p of active){row(s.action,p,'action',s.action);if(s.responseEvent)row(s.action,p,'response',s.responseEvent);}
 for(const p of active){const seen=new Set();for(const e of extracted[p].flatMap(x=>x.evidence)){const k=JSON.stringify([e.kind,e.name]);if(seen.has(k))continue;seen.add(k);if(e.kind==='response'&&['message','load','click','resize','scroll','keydown','keyup','DOMContentLoaded','error','focus','blur','change','input','submit','touchstart','touchend','pointerdown','pointerup','mousemove','mousedown','mouseup','beforeunload','unload','popstate','hashchange','storage','visibilitychange','online','offline'].includes(e.name)&&!spec.some(s=>s.responseEvent===e.name))continue;if(!spec.some(s=>(e.kind==='action'?s.action:s.responseEvent)===e.name))row(e.name,p,e.kind,e.name,true);}}
 return rows;
}
const sheetOrder=['플랫폼','기능명','점검 대상','결과','담당자','수정 내용','개발 예정일','QA 예정일','운영 예정일','진행 상태','수정 위치','검토 제안','항목 키','분석 ID'];
const resultOrder=['코드에 없음','이름 불일치','명세에 없음','분석 못 함','코드에 있음'];
const sheetWidth={'플랫폼':9,'기능명':16,'점검 대상':26,'결과':22,'담당자':11,'수정 내용':34,'개발 예정일':12,'QA 예정일':12,'운영 예정일':12,'진행 상태':15,'수정 위치':46,'검토 제안':58,'항목 키':12,'분석 ID':12};
function sortRows(list){const rank=r=>{const i=resultOrder.findIndex(k=>String(r['결과']).startsWith(k));return i<0?resultOrder.length:i;};return list.map((r,i)=>[r,i]).sort((a,b)=>platforms.indexOf(a[0]['플랫폼'])-platforms.indexOf(b[0]['플랫폼'])||rank(a[0])-rank(b[0])||a[1]-b[1]).map(x=>x[0]);}
function explain(r){const [kind,...rest]=String(r['점검 대상']).split(': '),name=rest.join(': '),what=kind==='기능'?'기능':'응답 이벤트',p=r['플랫폼'],res=String(r['결과']);
 if(res.startsWith('코드에 없음'))return `${p} 코드에서 ${what} “${name}”을(를) 찾지 못했습니다.`;
 if(res.startsWith('이름 불일치'))return `${p} 코드에 ${what} “${name}”과(와) 비슷하지만 다른 이름이 있습니다.`;
 if(res.startsWith('명세에 없음'))return `${p} 코드에 있는 ${what} “${name}”이(가) 명세서에는 없습니다.`;
 if(res.startsWith('분석 못 함'))return `${p} 코드 파일을 분석하지 못해 ${what} “${name}”을(를) 확인하지 못했습니다.`;
 return `${p} 코드에서 ${what} “${name}”을(를) 찾았습니다. 실제 동작은 확인하지 않았습니다.`;}
function pickerLabel(r){const [kind,...rest]=String(r['점검 대상']).split(': ');return `${r['플랫폼']} · ${rest.join(': ')} (${kind==='기능'?'기능':'응답'}) · ${String(r['결과']).split('·')[0]}`;}
function scheduleSheet(list){return {aoa:[sheetOrder,...sortRows(list).map(r=>sheetOrder.map(k=>String(r[k]??'')))],cols:sheetOrder.map(k=>({wch:sheetWidth[k]}))};}
function summarySheet(list){const out=[['BridgeCheck 점검 요약'],[],['결과','건수','뜻']];const meaning={'코드에 없음':'명세 이름을 코드에서 찾지 못함 · 먼저 확인','이름 불일치':'대소문자·밑줄만 다른 이름이 있음','명세에 없음':'코드에만 있는 이름','분석 못 함':'지원하지 않는 문법이라 직접 확인','코드에 있음':'이름은 있음 · 동작은 확인 안 함'};for(const k of resultOrder)out.push([k,list.filter(r=>String(r['결과']).startsWith(k)).length,meaning[k]]);out.push(['합계',list.length,'']);out.push([],['담당자','배정 건수','확인 필요 건수']);const owners=[...new Set(list.map(r=>String(r['담당자']||'').trim()))].sort((a,b)=>(a?0:1)-(b?0:1)||a.localeCompare(b,'ko'));for(const o of owners){const mine=list.filter(r=>String(r['담당자']||'').trim()===o);out.push([o||'미지정',mine.length,mine.filter(r=>!String(r['결과']).startsWith('코드에 있음')).length]);}out.push([],['플랫폼','항목 수','확인 필요 건수']);for(const p of platforms){const mine=list.filter(r=>r['플랫폼']===p);if(mine.length)out.push([p,mine.length,mine.filter(r=>!String(r['결과']).startsWith('코드에 있음')).length]);}out.push([],['‘수정 일정’ 시트에서 담당자·수정 내용·예정일·진행 상태를 입력해 다시 불러오세요. Android → iOS → React 순이며, 플랫폼마다 확인이 필요한 항목이 위에 있습니다.']);return {aoa:out,cols:[{wch:16},{wch:12},{wch:40}]};}
function validDate(s){if(!s)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s&&s>='2000-01-01'&&s<='2100-12-31';}
function validateSchedule(r){for(const k of editable){if(typeof r[k]!=='string'||r[k].length>(k==='수정 내용'?2000:160)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(r[k]))throw Error(`${k}: 입력 길이/형식을 확인하세요.`);}
 if(!statuses.includes(r['진행 상태']))throw Error('진행 상태가 올바르지 않습니다.');
 const dates=['개발 예정일','QA 예정일','운영 예정일'].map(k=>r[k]);if(!dates.every(validDate))throw Error('날짜는 2000~2100년 YYYY-MM-DD 형식이어야 합니다.');const filled=dates.filter(Boolean);if(filled.some((d,i)=>i&&d<filled[i-1]))throw Error('개발 → QA → 운영 날짜 순서를 확인하세요.');return r;
}
function importSchedule(current,incoming){
 if(!incoming.length||incoming.length>5000)throw Error('일정 행은 1~5000개여야 합니다.');const map=new Map(current.map(r=>[r['항목 키'],r])),seen=new Set(),changes=[];let stale=0;
 for(const r of incoming){const key=r['항목 키'];if(seen.has(key)||!map.has(key))throw Error('중복 항목 키 또는 현재 결과에 없는 항목입니다. 현재 보고서에서 다시 작성하세요.');seen.add(key);const old=map.get(key);if(typeof r['담당자']==='string')r['담당자']=ownerKey(r['담당자']);validateSchedule(r);if(r['분석 ID']!==old['분석 ID'])stale++;const update={...old};for(const k of editable)update[k]=r[k];changes.push(update);}
 return {changes,stale,rows:current.map(r=>changes.find(c=>c['항목 키']===r['항목 키'])||r)};
}
const ownerKey=name=>String(name??'').normalize('NFC').trim();
function addOwner(list,name){const s=ownerKey(name);if(!s)throw Error('담당자 이름을 입력하세요.');if(list.length>=200)throw Error('담당자는 최대 200명까지 등록할 수 있습니다.');folderName(s);const same=list.find(x=>x.toLocaleLowerCase()===s.toLocaleLowerCase());if(same)throw Error(`이미 목록에 있는 담당자입니다: ${same}`);return [...list,s];}
function mergeOwners(list,rows){const out=[...list];for(const r of rows){const s=ownerKey(r['담당자']);if(s&&!out.includes(s))out.push(s);}return out;}
function ownerSummary(list,rows){const names=mergeOwners(list,rows);return {owners:names.map(name=>({name,count:rows.filter(r=>ownerKey(r['담당자'])===name).length})),unassigned:rows.filter(r=>!ownerKey(r['담당자'])).length};}
function rowsForOwner(rows,filter){if(!filter||filter==='all')return rows;if(filter==='none')return rows.filter(r=>!ownerKey(r['담당자']));if(filter.startsWith('o:'))return rows.filter(r=>ownerKey(r['담당자'])===filter.slice(2));return rows;}
function folderName(owner){const s=owner.normalize('NFC').trim();if(!s)return '미지정';if(s.length>60||/[<>:"/\\|?*\x00-\x1f]/.test(s)||/[. ]$/.test(s)||/^\./.test(s)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(s))throw Error(`담당자 이름을 폴더명으로 사용할 수 없습니다: ${s}`);return s;}
function groupOwners(rows){const groups=new Map(),names=new Map();for(const r of rows){validateSchedule(r);const name=folderName(r['담당자']),canonical=name.toLocaleLowerCase();if(names.has(canonical)&&names.get(canonical)!==name)throw Error('대소문자만 다른 담당자 이름을 통일하세요.');names.set(canonical,name);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);}return [...groups].map(([name,rows])=>({name,rows}));}
async function saveGroups(directory,groups,makeWorkbook,filename){
 const results=[];for(const group of groups){let stream;try{const sub=await directory.getDirectoryHandle(group.name,{create:true});try{await sub.getFileHandle(filename);throw Error('같은 파일이 있어 저장하지 않았습니다. 다시 저장하세요.');}catch(e){if(e.name!=='NotFoundError')throw e;}const data=makeWorkbook(group.rows);const handle=await sub.getFileHandle(filename,{create:true});stream=await handle.createWritable();await stream.write(data);await stream.close();stream=null;results.push({name:group.name,ok:true});}catch(e){if(stream)try{await stream.abort();}catch(_){}results.push({name:group.name,ok:false,error:e.message});}}return results;
}
return {platforms,statuses,editable,columns,tokens,extract,specRows,analyze,validateSchedule,importSchedule,groupOwners,saveGroups,folderName,ownerKey,addOwner,mergeOwners,ownerSummary,rowsForOwner,sortRows,scheduleSheet,summarySheet,sheetOrder,explain,pickerLabel};
});
