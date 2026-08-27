# AXE BUILD v1.0.0 · AXE HUB

외부 공개용 추천세팅 / 개조서 / 제보 서비스입니다.

## 1. 환경변수

`.env.example`을 복사해 `.env.local`로 만듭니다.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
VITE_AXE_CONTACT_URL=
VITE_SITE_URL=http://localhost:5173
```

> `sb_secret_...`, `service_role` 등 비밀키는 절대 프론트엔드에 넣지 마세요.

## 2. 실행

```bash
npm install
npm run check
npm run dev
```

브라우저에서 `http://localhost:5173` 접속.

## 3. Discord 로그인

Supabase Authentication > Providers > Discord 설정 및
URL Configuration의 `http://localhost:5173/**` 등록이 필요합니다.

## 4. 관리자 지정

사이트에서 Discord 로그인 1회 후 Supabase SQL Editor:

```sql
select id, email, raw_user_meta_data
from auth.users
order by created_at desc;
```

본인 UUID 확인 후:

```sql
update public.profiles
set is_admin = true
where id = '본인-UUID';
```

## 5. Vercel

- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_AXE_CONTACT_URL` (선택)
  - `VITE_SITE_URL` = 실제 배포 주소

배포 후 Supabase Authentication > URL Configuration에 실제 Vercel 주소도 추가하세요.

## 기능

로그인 없이:
- 추천세팅 조회
- 개조서 검색

Discord 로그인:
- 추천세팅 작성
- 세팅 복제
- 즐겨찾기
- 개조서 누락/수정 제보
- 증빙 이미지 업로드

관리자:
- 제보 승인 / 반려
