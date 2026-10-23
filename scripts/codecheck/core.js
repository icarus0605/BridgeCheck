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
      if(['callBridge','invokeBridge'].includes(v(i))&&v(i+1)==='('&&[',',')'].includes(v(i+3)))add(i+2,'action','Bridge 호출 인수 후보');
      if(v(i)==='window'&&v(i+1)==='.'&&v(i+2)==='Android'&&v(i+3)==='.'&&v(i+5)==='(')named(i+4,'action','window.Android 직접 호출');
      if(v(i)==='postMessage'&&v(i+1)==='('&&v(i+2)==='{'){
        for(let j=i+3;j<Math.min(i+30,t.length)&&v(j)!=='}';j++)if(v(j)==='action'&&v(j+1)===':'&&[',','}'].includes(v(j+3)))add(j+2,'action','postMessage action 후보');
      }
      if(['addEventListener','on'].includes(v(i))&&v(i+1)==='('&&v(i+3)===',')add(i+2,'response','이벤트 수신 후보');
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
      const end=dispatchEnd(i);if(end>=0&&v(end)==='='&&v(end+1)==='='&&[ ')','{','&','|',':'].includes(v(end+3)))add(end+2,'action','디스패치 이름 비교 분기 후보');
      // Switch/when body tied to a named dispatch variable, not arbitrary case strings.
      if(['switch','when'].includes(v(i))){
        let j=i+1;if(v(j)==='(')j++;j=dispatchEnd(j);if(j<0)continue;if(v(j)===')')j++;if(v(j)!=='{')continue;
        let depth=1;for(j++;j<t.length&&depth;j++){if(v(j)==='{')depth++;if(v(j)==='}')depth--;if(depth===1){if(v(j)==='case'&&v(j+2)===':')add(j+1,'action','switch action 분기 후보');if(literal(t[j])&&v(j+1)==='-'&&v(j+2)==='>')add(j,'action','when action 분기 후보');}}
      }
      if(['sendEvent','emit','emitEvent'].includes(v(i))&&v(i+1)==='('&&[',',')'].includes(v(i+3)))add(i+2,'response','이벤트 발신 호출 후보');
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
 const result=excluded?'분석 제외·확인 필요':extra?'명세 외 후보':found.length?'이름 발견·검토 필요':similar.length?'유사 이름·확인 필요':'미발견·확인 필요';
 const position=found.length?found.map(e=>`${e.path}:${e.line} (${e.pattern})`).join('\n'):similar.length?similar.map(e=>`${e.path}:${e.line} (유사 이름: ${e.name})`).join('\n'):anchors.length?'검토 시작 위치(수정 확정 아님): '+anchors.map(a=>`${a.path}:${a.line}`).join(', '):'관련 위치를 찾지 못함 — Bridge 파일 범위를 확인하세요';
 const advice=extra?'명세에 없는 이름입니다. Bridge 기능인지 확인한 뒤 명세 추가 또는 불필요한 코드 제거를 검토하세요.':found.length?'이름을 참조하는 코드 후보입니다. 실제 등록·호출 경로, 요청/응답 필드 및 실행 결과를 확인하세요.':`${p}에서 ${kind==='action'?'기능 처리/호출':'이벤트 발신/수신'} 이름 “${name}”을 찾지 못했습니다. 누락·이름 변경·동적 이름·업로드 범위를 확인하세요.`;
 rows.push({'항목 키':JSON.stringify([action,p,kind,name,extra?'extra':'spec']),'분석 ID':'','기능명':action,'플랫폼':p,'점검 대상':`${kind==='action'?'기능':'응답 이벤트'}: ${name}`,'결과':result,'수정 위치':position,'검토 제안':advice,'담당자':'','수정 내용':'','개발 예정일':'','QA 예정일':'','운영 예정일':'','진행 상태':'미정'});
 }
 for(const s of spec)for(const p of active){row(s.action,p,'action',s.action);if(s.responseEvent)row(s.action,p,'response',s.responseEvent);}
 for(const p of active){const seen=new Set();for(const e of extracted[p].flatMap(x=>x.evidence)){const k=JSON.stringify([e.kind,e.name]);if(seen.has(k))continue;seen.add(k);if(e.kind==='response'&&['message','load','click','resize','scroll','keydown','keyup','DOMContentLoaded','error','focus','blur','change','input','submit','touchstart','touchend','pointerdown','pointerup','mousemove','mousedown','mouseup','beforeunload','unload','popstate','hashchange','storage','visibilitychange','online','offline'].includes(e.name)&&!spec.some(s=>s.responseEvent===e.name))continue;if(!spec.some(s=>(e.kind==='action'?s.action:s.responseEvent)===e.name))row(e.name,p,e.kind,e.name,true);}}
 return rows;
}
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
return {platforms,statuses,editable,columns,tokens,extract,specRows,analyze,validateSchedule,importSchedule,groupOwners,saveGroups,folderName,ownerKey,addOwner,mergeOwners,ownerSummary,rowsForOwner};
});
