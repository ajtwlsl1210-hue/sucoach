-- ================================================================
-- 수코치 (SuCoach) — DB Migration v2.0 → v3.0
-- 설계 문서 v1.1 기반 전면 재설계
-- ================================================================
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run
-- ================================================================

-- ──────────────────────────────────────────────────────────────
-- 0. 기존 테이블 정리
-- ──────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.memos          CASCADE;
DROP TABLE IF EXISTS public.onboarding     CASCADE;
DROP TABLE IF EXISTS public.files          CASCADE;
DROP TABLE IF EXISTS public.assignments    CASCADE;
DROP TABLE IF EXISTS public.students       CASCADE;
DROP TABLE IF EXISTS public.invite_tokens  CASCADE;
DROP TABLE IF EXISTS public.users          CASCADE;


-- ──────────────────────────────────────────────────────────────
-- 1. USERS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  display_name  TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('admin','tutor','student','parent')),
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE  public.users IS '수코치 사용자 계정';
COMMENT ON COLUMN public.users.password_hash IS 'SHA-256(비밀번호 + sucoach_salt_2026)';


-- ──────────────────────────────────────────────────────────────
-- 2. STUDENTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.students (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  school         TEXT        NOT NULL,
  grade          INT         NOT NULL CHECK (grade BETWEEN 1 AND 6),
  class_num      INT,
  student_num    INT,
  target_grade   TEXT,
  student_type   TEXT        CHECK (student_type IN ('무기력형','과설계형','창의형','수동형')),
  notes          TEXT,
  monthly_fee    NUMERIC     NOT NULL DEFAULT 70000,
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_user_id UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  tutor_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE  public.students IS '학생 프로필';
COMMENT ON COLUMN public.students.tutor_id IS '담당 강사 (users.id, role=tutor)';
COMMENT ON COLUMN public.students.student_type IS '무기력형/과설계형/창의형/수동형';

CREATE INDEX idx_students_user_id        ON public.students(user_id);
CREATE INDEX idx_students_parent_user_id ON public.students(parent_user_id);
CREATE INDEX idx_students_tutor_id       ON public.students(tutor_id);


-- ──────────────────────────────────────────────────────────────
-- 3. ASSIGNMENTS (수행평가)
-- 8단계: 접수→분석완료→면담완료→초안대기→피드백완료→수정중→최종확인→완료
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.assignments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject           TEXT        NOT NULL,
  title             TEXT        NOT NULL,
  type              TEXT        CHECK (type IN ('서술형','발표형','보고서형','탐구형','실험형','프로젝트형','기타')),
  max_score         NUMERIC,
  school_deadline   DATE,
  internal_deadline DATE,                          -- 학교마감 -5일 (자동 계산 or 수동)
  stage             TEXT        NOT NULL DEFAULT '접수'
                                CHECK (stage IN (
                                  '접수','분석완료','면담완료','초안대기',
                                  '피드백완료','수정중','최종확인','완료'
                                )),
  score             NUMERIC,
  grade             TEXT,                          -- 취득 등급 (예: 1등급, 2등급)
  teacher_comment   TEXT,
  growth_note       TEXT,
  created_by        UUID        REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE  public.assignments IS '수행평가 (8단계 진행)';
COMMENT ON COLUMN public.assignments.stage IS '접수→분석완료→면담완료→초안대기→피드백완료→수정중→최종확인→완료';
COMMENT ON COLUMN public.assignments.internal_deadline IS '학교마감 -5일 내부 마감';

CREATE INDEX idx_assignments_student_id ON public.assignments(student_id);
CREATE INDEX idx_assignments_stage      ON public.assignments(stage);
CREATE INDEX idx_assignments_deadline   ON public.assignments(school_deadline);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ──────────────────────────────────────────────────────────────
-- 4. FILES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.files (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID        REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id    UUID        REFERENCES public.students(id)    ON DELETE CASCADE,
  uploader_id   UUID        NOT NULL REFERENCES public.users(id),
  uploader_role TEXT        NOT NULL CHECK (uploader_role IN ('admin','tutor','student','parent')),
  file_type     TEXT        NOT NULL
                            CHECK (file_type IN (
                              '연간계획서','루브릭','코칭가이드','초안','피드백','수정본','최종본','기타'
                            )),
  file_name     TEXT        NOT NULL,
  file_url      TEXT        NOT NULL,
  file_size     BIGINT      NOT NULL DEFAULT 0,
  note          TEXT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE  public.files IS '업로드 파일 메타데이터';
COMMENT ON COLUMN public.files.assignment_id IS 'NULL이면 학생 자료실 파일';

CREATE INDEX idx_files_assignment_id ON public.files(assignment_id);
CREATE INDEX idx_files_student_id    ON public.files(student_id);
CREATE INDEX idx_files_uploaded_at   ON public.files(uploaded_at DESC);


-- ──────────────────────────────────────────────────────────────
-- 5. ONBOARDING (첫 로그인 필수 완료)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.onboarding (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  consent_signed      BOOLEAN     NOT NULL DEFAULT FALSE,
  consent_signed_at   TIMESTAMPTZ,
  survey_completed    BOOLEAN     NOT NULL DEFAULT FALSE,
  survey_completed_at TIMESTAMPTZ,
  survey_data         JSONB,                       -- 설문지 응답 저장
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE  public.onboarding IS '첫 로그인 온보딩 완료 기록 (학생/학부모)';


-- ──────────────────────────────────────────────────────────────
-- 6. MEMOS (메모/코칭 기록)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.memos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID        REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id    UUID        REFERENCES public.students(id)    ON DELETE CASCADE,
  author_id     UUID        NOT NULL REFERENCES public.users(id),
  memo_type     TEXT        NOT NULL CHECK (memo_type IN ('면담','피드백','특이사항','성장')),
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.memos IS '면담/피드백/특이사항/성장 메모';

CREATE INDEX idx_memos_assignment_id ON public.memos(assignment_id);
CREATE INDEX idx_memos_student_id    ON public.memos(student_id);


-- ──────────────────────────────────────────────────────────────
-- 7. RLS (anon key 전체 허용 — 앱 레이어에서 역할 판단)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memos       ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY "users_select" ON public.users FOR SELECT TO anon USING (TRUE);
CREATE POLICY "users_insert" ON public.users FOR INSERT TO anon WITH CHECK (TRUE);
CREATE POLICY "users_update" ON public.users FOR UPDATE TO anon USING (TRUE);

-- students
CREATE POLICY "students_select" ON public.students FOR SELECT TO anon USING (TRUE);
CREATE POLICY "students_insert" ON public.students FOR INSERT TO anon WITH CHECK (TRUE);
CREATE POLICY "students_update" ON public.students FOR UPDATE TO anon USING (TRUE);
CREATE POLICY "students_delete" ON public.students FOR DELETE TO anon USING (TRUE);

-- assignments
CREATE POLICY "assignments_select" ON public.assignments FOR SELECT TO anon USING (TRUE);
CREATE POLICY "assignments_insert" ON public.assignments FOR INSERT TO anon WITH CHECK (TRUE);
CREATE POLICY "assignments_update" ON public.assignments FOR UPDATE TO anon USING (TRUE);
CREATE POLICY "assignments_delete" ON public.assignments FOR DELETE TO anon USING (TRUE);

-- files
CREATE POLICY "files_select" ON public.files FOR SELECT TO anon USING (TRUE);
CREATE POLICY "files_insert" ON public.files FOR INSERT TO anon WITH CHECK (TRUE);
CREATE POLICY "files_delete" ON public.files FOR DELETE TO anon USING (TRUE);

-- onboarding
CREATE POLICY "onboarding_select" ON public.onboarding FOR SELECT TO anon USING (TRUE);
CREATE POLICY "onboarding_insert" ON public.onboarding FOR INSERT TO anon WITH CHECK (TRUE);
CREATE POLICY "onboarding_update" ON public.onboarding FOR UPDATE TO anon USING (TRUE);

-- memos
CREATE POLICY "memos_select" ON public.memos FOR SELECT TO anon USING (TRUE);
CREATE POLICY "memos_insert" ON public.memos FOR INSERT TO anon WITH CHECK (TRUE);
CREATE POLICY "memos_update" ON public.memos FOR UPDATE TO anon USING (TRUE);
CREATE POLICY "memos_delete" ON public.memos FOR DELETE TO anon USING (TRUE);


-- ──────────────────────────────────────────────────────────────
-- 8. 초기 계정 생성
-- 비밀번호 해시: SHA-256(비밀번호 + 'sucoach_salt_2026')
-- admin@sucoach.kr     / ljb1210hjw!
-- teacher@sucoach.kr   / teacher1234
-- student@sucoach.kr   / student1234
-- parent@sucoach.kr    / parent1234
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.users (email, display_name, role, password_hash) VALUES
  ('admin@sucoach.kr',   '이종범 (관리자)', 'admin',
   '69a1154dd61570cc6110c6499e0a6d4c851bc8faecbef45c972001aa60ad18d5'),
  ('teacher@sucoach.kr', '재우 강사', 'tutor',
   '34c4706ae5c16ab617403c9cfeb46518857538abb60650983929d72fad49d3b3'),
  ('student@sucoach.kr', '테스트 학생', 'student',
   'ed52b1376836bbf19d57d43b598930a9e0ae03bc7b45fc899e3d14a3cfc74c5c'),
  ('parent@sucoach.kr',  '테스트 학부모', 'parent',
   'b8a1bb452e711fb6bfa3d85d251dc412ae2123fe5c97e2e138af3229b79e2fc1')
ON CONFLICT (email) DO NOTHING;

-- 테스트 학생 데이터 (student / parent 계정에 연결)
DO $$
DECLARE
  v_student_user_id UUID;
  v_parent_user_id  UUID;
  v_tutor_id        UUID;
BEGIN
  SELECT id INTO v_student_user_id FROM public.users WHERE email = 'student@sucoach.kr';
  SELECT id INTO v_parent_user_id  FROM public.users WHERE email = 'parent@sucoach.kr';
  SELECT id INTO v_tutor_id        FROM public.users WHERE email = 'teacher@sucoach.kr';

  INSERT INTO public.students
    (name, school, grade, class_num, student_num, target_grade, student_type,
     user_id, parent_user_id, tutor_id, monthly_fee)
  VALUES
    ('테스트학생', '수코치고등학교', 2, 3, 15, '1등급', '무기력형',
     v_student_user_id, v_parent_user_id, v_tutor_id, 70000)
  ON CONFLICT DO NOTHING;
END;
$$;

-- 주의: 위 INSERT의 password_hash는 앱 첫 실행 시 setup 페이지에서 자동 생성하거나,
-- 아래 Python 코드로 미리 계산해서 넣으세요:
--
-- import hashlib
-- passwords = {
--   'admin@sucoach.kr': 'ljb1210hjw!',
--   'teacher@sucoach.kr': 'teacher1234',
--   'student@sucoach.kr': 'student1234',
--   'parent@sucoach.kr': 'parent1234',
-- }
-- for email, pw in passwords.items():
--   h = hashlib.sha256((pw + 'sucoach_salt_2026').encode()).hexdigest()
--   print(f"-- {email}: {h}")


-- ──────────────────────────────────────────────────────────────
-- 9. 완료 확인
-- ──────────────────────────────────────────────────────────────
SELECT
  tablename,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = t.tablename) AS columns,
  rowsecurity AS rls_enabled
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename IN ('users','students','assignments','files','onboarding','memos')
ORDER BY tablename;
