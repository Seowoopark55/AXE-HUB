# AXE BUILD v1.1.2 · AXE HUB

외부 공개용 추천세팅 / 개조서 / 제보 서비스입니다.

## V1.0.2 UI / 내부 추천세팅 UX 반영

- 메인 우측의 의미가 불분명한 장식 카드를 제거하고 **실제 공식 추천세팅 미리보기**로 교체
- 메인에서 **추천세팅 바로 보기 / 공식 세팅 보기 / 빠른 탐색** 제공
- 추천세팅 목록을 텍스트 카드에서 **겉옷·상의·하의·신발 슬롯형 카드**로 변경
- 개조서를 **목록 + 상세 도감형 UI**로 변경하고 부위 필터 추가
- 제보 화면에 **누락 → 수정 → 검수 반영** 흐름을 시각적으로 정리
- Discord 로그인 안내에 **서버 가입/메시지 접근 권한을 요청하지 않음**을 명시
- 기존 Supabase / Discord OAuth / 작성 / 복제 / 즐겨찾기 / 제보 / 관리자 기능 유지

## 적용

이 ZIP의 파일 전체를 기존 GitHub 저장소 루트에 덮어쓰기한 뒤 Commit 하면 됩니다.
GitHub와 Vercel이 연결되어 있으면 자동 배포됩니다.

`.env.local`은 GitHub에 올리지 않습니다.

Vercel 환경변수는 기존 값을 그대로 유지합니다.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
VITE_SITE_URL=https://YOUR-SITE.vercel.app
VITE_AXE_CONTACT_URL=
```

**DB SQL 변경 없음.** 기존 AXE HUB Supabase를 그대로 사용합니다.


## V1.0.3

실제 AXE 회사 브랜딩과 팀복 이미지를 사이트 전반에 반영했습니다.
DB 스키마 변경 없이 기존 AXE HUB Supabase를 그대로 사용합니다.


## V1.0.4

장비 상세 가독성, 실제 접두/접미 옵션 표시, 작성글 수정/삭제,
그리고 하단 AXE 모집 배너의 컴팩트화가 핵심입니다.


## V1.1.0

추천/비추천, 댓글, 내 프리셋, 공지사항, 승인형 닉네임과 우측 고정 AXE 리모컨 메뉴를 추가했습니다.
이 버전은 `SUPABASE-MIGRATION-V1.1.0.sql` 실행이 필수입니다.


## V1.1.1

추천세팅 상세를 AXE NET 내부용 최종 UI 구조에 맞춰
`2x2 장비 + 고정 옵션 툴팁 + 전체 옵션 요약` 방식으로 변경했습니다.

기존 V1.1.0 Supabase 마이그레이션 이후 추가 SQL은 없습니다.


## V1.1.2

업로드된 실제 AXE NET 프로젝트의 `src/modules/info/infoView.js`와
`src/modules/info/info.css`의 추천세팅 구현을 기준으로 외부용 상세 UI를 재구성했습니다.

특히 AXE NET v1.46.4에서 해결된 `tooltip pointer-events:none` hover 안정화
방식까지 그대로 반영했습니다.
