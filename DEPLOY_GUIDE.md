# 수코치 배포 가이드 v3.1
> 최종 업데이트: 2026-03-27 | 호스팅: Vercel | DB: Supabase

---

## 운영 접속 정보

| 항목 | 값 |
|------|-----|
| 사이트 URL | https://sucoach.vercel.app |
| Supabase URL | https://muqiiejifumccadpxrzk.supabase.co |
| Supabase anon key | `sb_publishable_USHbSWpD855vfp0Nmjd1Og_5m3KdKgC` |

---

## 파일 구성 (v3.1)

| 파일 | 역할 |
|------|------|
| `login.html` | 로그인 (역할별 리다이렉트) |
| `onboarding.html` | 첫 로그인 온보딩 (학생/학부모) |
| `admin-dashboard.html` | 관리자: 학생·수행평가·파일·내부자료·온보딩·계정 전체 관리 |
| `student-detail.html` | 관리자용 학생 상세 |
| `assignment-detail.html` | 수행평가 상세 (8단계 + T2 기록) |
| `tutor-dashboard.html` | 강사: 담당 학생·수행평가·체크리스트·내부자료 |
| `student-page.html` | 학생: 내 수행평가 현황 |
| `parent-page.html` | 학부모: 자녀 수행평가 현황 |
| `db.js` | Supabase 연동 공통 모듈 |
| `index.html` | 루트 리다이렉트 (→ login.html) |
| `_redirects` | Vercel SPA 라우팅 설정 |

---

## 4역할 계정

| 역할 | 이메일 | 비밀번호 | 로그인 후 이동 |
|------|--------|----------|--------------|
| admin | admin@sucoach.kr | ljb1210hjw! | admin-dashboard.html |
| tutor | teacher@sucoach.kr | teacher1234 | tutor-dashboard.html |
| student | student@sucoach.kr | student1234 | student-page.html |
| parent | parent@sucoach.kr | parent1234 | parent-page.html |

> 인증 방식: `SHA-256(비밀번호 + 'sucoach_salt_2026')` → Supabase users 테이블 조회

---

## DB 스키마

**테이블 6개:** users / students / assignments / files / onboarding / memos

**수행평가 8단계:** 접수 → 분석완료 → 면담완료 → 초안대기 → 피드백완료 → 수정중 → 최종확인 → 완료

**T2 추가 컬럼 (assignments):** expected_score, revision_count, cliche_removed, structure_explained, interview_minutes, feedback_minutes, final_minutes

---

## STEP 1 — Supabase 세팅 (신규 프로젝트 시)

1. https://supabase.com/dashboard 접속 → 프로젝트 선택
2. **SQL Editor** → `setup_v2.sql` 전체 붙여넣기 → Run
3. T2 컬럼 추가: `setup_v3_patch.sql` → Run
4. **Storage** → 버킷 `sucoach-files` 생성 (Public: ✅)
5. 버킷 Policies: SELECT/INSERT anon Allow

---

## STEP 2 — Vercel 배포

### 방법 A: Vercel Dashboard 드래그 (권장)

1. https://vercel.com/dashboard 접속 → 프로젝트 선택 → **Deployments**
2. **Deploy** → 파일 선택 또는 ZIP 드래그 앤 드롭
3. 아래 파일만 포함할 것 (`.sql` 파일 제외):
   ```
   login.html, onboarding.html, admin-dashboard.html, student-detail.html,
   assignment-detail.html, tutor-dashboard.html, student-page.html, parent-page.html,
   db.js, index.html, _redirects
   ```

### 방법 B: Cowork VM에서 ZIP 생성 후 브라우저 배포

> VM은 인터넷 직접 접근 불가. 아래 절차로 브라우저 경유 배포.

**1. ZIP 생성**
```bash
cd /sessions/.../mnt/Claude\ WorkSpace/Suhaengpyeong/02_MVP/
zip -j sucoach_vX.X.zip login.html onboarding.html admin-dashboard.html \
  student-detail.html assignment-detail.html tutor-dashboard.html \
  student-page.html parent-page.html db.js index.html _redirects
```

**2. Vercel에 배포**
- Vercel Dashboard → 해당 프로젝트 → **Deployments** 탭
- 드래그 앤 드롭 또는 CLI 사용

---

## STEP 3 — DB 스키마 변경 (운영 중)

브라우저에서 Supabase SQL 직접 실행:

```javascript
// Supabase 대시보드 탭 → 브라우저 콘솔
var token = JSON.parse(localStorage['supabase.dashboard.auth.token']).access_token;
fetch('https://api.supabase.com/v1/projects/muqiiejifumccadpxrzk/database/query', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'ALTER TABLE ...' })
});
```

---

## 학생 등록 워크플로우

1. 관리자 로그인 → admin-dashboard.html
2. **학생 관리** 탭 → **+ 학생 등록** 버튼
3. 이름 / 학교 / 학년 / 이메일(필수) / 학부모 이메일(선택) / 담당강사 입력
4. 등록 완료 → 학생계정 + 학부모계정 자동 생성 (초기 비밀번호: 1234)
5. 이메일/비밀번호를 학생·학부모에게 카카오톡으로 전달
6. 첫 로그인 → 이용동의서 + 인테이크 설문 완료 후 대시보드 접근 가능

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| Frontend | HTML5 / Vanilla JS (프레임워크 없음) |
| Backend | Supabase (PostgreSQL + Storage) |
| 인증 | SHA-256 커스텀 해시 + localStorage 세션 |
| 파일 업로드 | Supabase Storage (최대 10MB) |
| Excel 내보내기 | SheetJS CDN |
| 폰트 | Noto Sans KR (Google Fonts) |
| 호스팅 | Vercel |
