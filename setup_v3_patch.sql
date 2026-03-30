-- ================================================================
-- 수코치 (SuCoach) — DB Patch v3.0 → v3.1
-- T2 기능 추가: 예상점수, 수정횟수, 코칭시간, 클리셰/구술 확인 플래그
-- ================================================================
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run
-- 이미 컬럼이 있는 경우 IF NOT EXISTS로 안전하게 실행됩니다.
-- ================================================================

-- ──────────────────────────────────────────────────────────────
-- 1. assignments 테이블에 T2 컬럼 추가
-- ──────────────────────────────────────────────────────────────

-- 예상 점수 (사전 예측 vs 실제 비교용)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS expected_score NUMERIC;

-- 수정 횟수 (피드백 → 수정 사이클 카운트)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS revision_count INT NOT NULL DEFAULT 0;

-- 클리셰 제거 여부 (피드백 체크리스트)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS cliche_removed BOOLEAN;

-- 구술 핵심 확인 여부 (최종확인 단계: "이 글 핵심이 뭐야?" 통과 여부)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS structure_explained BOOLEAN;

-- 면담 소요 시간 (분)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS interview_minutes INT;

-- 피드백 소요 시간 (분)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS feedback_minutes INT;

-- 최종 확인 소요 시간 (분)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS final_minutes INT;

COMMENT ON COLUMN public.assignments.expected_score     IS '사전 예상 점수 (실제 점수와 비교)';
COMMENT ON COLUMN public.assignments.revision_count     IS '수정 사이클 횟수 (초안→피드백→수정 반복)';
COMMENT ON COLUMN public.assignments.cliche_removed     IS '클리셰 표현 제거 완료 여부';
COMMENT ON COLUMN public.assignments.structure_explained IS '"이 글 핵심이 뭐야?" 구술 확인 통과 여부';
COMMENT ON COLUMN public.assignments.interview_minutes  IS '면담 소요 시간 (분)';
COMMENT ON COLUMN public.assignments.feedback_minutes   IS '피드백 소요 시간 (분)';
COMMENT ON COLUMN public.assignments.final_minutes      IS '최종 확인 소요 시간 (분)';


-- ──────────────────────────────────────────────────────────────
-- 2. 완료 확인
-- ──────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'assignments'
  AND column_name IN (
    'expected_score', 'revision_count', 'cliche_removed',
    'structure_explained', 'interview_minutes', 'feedback_minutes', 'final_minutes'
  )
ORDER BY ordinal_position;
