// 발표용 samples/demo 엑셀 생성. 브라우저와 같은 방식으로 분석 ID를 계산합니다.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const B=require('./codecheck/core.js'),X=require('./codecheck/vendor/xlsx.full.min.js');
const dir=path.join(__dirname,'../samples/demo');
const specAoa=[['기능명','응답 이벤트','설명'],['openCamera','cameraResult','카메라 촬영'],['getLocation','locationResult','현재 위치'],['login','loginResult','앱 로그인'],['shareContent','shareResult','공유하기'],['closeWebView','','웹뷰 닫기']];
const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(specAoa),'Bridge 명세');fs.writeFileSync(path.join(dir,'1_Bridge명세.xlsx'),X.write(wb,{type:'buffer',bookType:'xlsx'}));
const spec=B.specRows(specAoa.slice(1).map(r=>({action:r[0],responseEvent:r[1]})));
const files=[['Android','AndroidBridge.kt'],['iOS','IOSBridge.swift'],['React','web.tsx']].map(([platform,name])=>({path:name,platform,text:fs.readFileSync(path.join(dir,name),'utf8')}));
const id=crypto.createHash('sha256').update(JSON.stringify({spec,files})).digest('hex');
const rows=B.analyze(spec,files).map(r=>({...r,'분석 ID':id}));
const plan={Android:['김안드','2026-10-27','2026-10-29','2026-11-03'],iOS:['이아이','2026-10-28','2026-10-30','2026-11-04'],React:['박리액트','2026-10-26','2026-10-28','2026-11-02']};
for(const r of rows){if(r['결과'].startsWith('코드에 있음'))continue;const [o,d,q,p]=plan[r['플랫폼']];Object.assign(r,{'담당자':o,'수정 내용':`${r['점검 대상']} 처리 확인·수정`,'개발 예정일':d,'QA 예정일':q,'운영 예정일':p,'진행 상태':'검토 중'});}
const ws=X.utils.aoa_to_sheet([B.columns,...rows.map(r=>B.columns.map(k=>String(r[k]??'')))]);const out=X.utils.book_new();X.utils.book_append_sheet(out,ws,'수정 일정');fs.writeFileSync(path.join(dir,'2_담당자_일정_불러오기용.xlsx'),X.write(out,{type:'buffer',bookType:'xlsx'}));
console.log(rows.length+'행',rows.filter(r=>r['담당자']).length+'행 담당자 지정',[...new Set(rows.map(r=>r['결과']))].join(', '));
