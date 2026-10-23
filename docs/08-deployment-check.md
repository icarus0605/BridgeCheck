# 외부 확인용 Vercel 배포 (2026-10-23)

- 사용자 요청에 따라 커밋 없이 CLI로 프로덕션 배포했습니다.
- 공개 주소: https://bridgecheck.vercel.app
- 배포 ID: dpl_3fxi8RTQwsoQYkiq3QQaxcuCfYMZ
- 배포 준비 폴더: .tmp/vercel-site. .vercelignore로 index.html만 포함합니다.
- 로그인 쿠키 없는 HTTP 요청에서 200 응답, 로컬 index.html과 SHA256 동일 확인.
- 앱 SHA256: 1950690fca3565644192b107942e5d5fe8d857bbfca7100afe9628e8fb0f71c8
- 동일 앱 코드에 대한 Claude/Codex 기존 합의 유지. 배포 직전 계약10묶음·하네스12상태 재검사 통과.
- 공개 주소에서 샘플 실행 → 오류 가능 1건 및 Android Markdown 실제 다운로드 확인.
- Git 커밋·푸시 미실행. GitHub 자동배포 연결은 실패했으며 이번 CLI 배포는 성공했습니다. 이후 로컬 수정은 재배포해야 반영됩니다.
- 기존 README 및 발표 PDF의 배포 전 상태 설명은 이 기록 이전 기준입니다. 심사 제출 전 자료 갱신은 별도 남은 작업입니다. 이번 요청은 외부 확인용 배포입니다.

## 사용성 개선본 배포 (2026-10-23)

- 기존 주소 https://bridgecheck.vercel.app 에 반영했습니다. 배포 ID dpl_9pNyHTxrum6HZvS2dEYEs4CFaetU.
- 로그인 없는 HTTP 200 및 원본 index.html SHA256 일치: 7e4d68a4eba5b77a87cd594acd9adcab755d718fa559903b7247d9917cdf9de5.
- 공개 사이트 새로고침 후 작성 도우미 존재, 샘플 오류가능1건, 세 가지 요청 파서 선택지 확인.
- README·PRD 현재 배포 상태 갱신. 발표 PDF는 이전 자료이며 이번에 수정하지 않았습니다.
