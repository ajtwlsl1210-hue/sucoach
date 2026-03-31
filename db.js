/**
 * 수코치 (SuCoach) — DB Client v3.0
 * 수행평가 전략관리 플랫폼 — 내부 운영 도구
 * 설계 문서 v1.1 기반
 */

const SUPABASE_URL = 'https://muqiiejifumccadpxrzk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_USHbSWpD855vfp0Nmjd1Og_5m3KdKgC';
const STORAGE_BUCKET = 'sucoach-files';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ── 비밀번호 해싱 (SHA-256) ────────────────────────────────────
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'sucoach_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

const DB = {

  // ── 상수 ─────────────────────────────────────────────────────
  STAGES: ['접수', '분석완료', '면담완료', '초안대기', '피드백완료', '수정중', '최종확인', '완료'],

  STAGE_LABELS: {
    '접수':     { icon: '📬', color: '#64748B', desc: '수행평가 접수됨' },
    '분석완료': { icon: '🔍', color: '#3B82F6', desc: '루브릭 분석 & 코칭가이드 완료' },
    '면담완료': { icon: '💬', color: '#8B5CF6', desc: '강사 면담 완료' },
    '초안대기': { icon: '✏️',  color: '#EC4899', desc: '학생 초안 업로드 대기' },
    '피드백완료':{ icon: '📝', color: '#F59E0B', desc: '피드백 작성 & 업로드 완료' },
    '수정중':   { icon: '🔄', color: '#EF4444', desc: '학생 수정본 업로드 대기' },
    '최종확인': { icon: '✅', color: '#10B981', desc: '강사 구두 확인 단계' },
    '완료':     { icon: '🎉', color: '#059669', desc: '학교 제출 & 완료' },
  },

  SUBJECTS: ['국어', '영어', '사회', '과학', '수학', '역사', '기타'],

  ASSIGNMENT_TYPES: ['서술형', '발표형', '보고서형', '탐구형', '실험형', '프로젝트형', '기타'],

  FILE_TYPES: ['연간계획서', '루브릭', '코칭가이드', '초안', '피드백', '수정본', '최종본', '기타'],

  STUDENT_TYPES: ['무기력형', '과설계형', '창의형', '수동형'],

  // ── 내부 REST 헬퍼 ────────────────────────────────────────────
  async _q(table, params = '', options = {}) {
    const { method = 'GET', body } = options;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    };
    if (method === 'POST' || method === 'PATCH') {
      headers['Prefer'] = 'return=representation';
    }
    const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
    const res = await fetch(url, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try { msg = JSON.parse(errText)?.message || errText; } catch {}
      console.error(`[DB] ${method} /${table}${params}`, errText);
      throw new Error(msg);
    }
    if (method === 'DELETE') return null;
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  },

  // ── 기본 CRUD ─────────────────────────────────────────────────
  async insert(table, obj) {
    const rows = await this._q(table, '', { method: 'POST', body: obj });
    return Array.isArray(rows) ? rows[0] : rows;
  },

  async update(table, id, patch) {
    const rows = await this._q(table, `?id=eq.${id}`, { method: 'PATCH', body: patch });
    return Array.isArray(rows) ? rows[0] : rows;
  },

  async delete(table, id) {
    await this._q(table, `?id=eq.${id}`, { method: 'DELETE' });
  },

  // ── 인증 ──────────────────────────────────────────────────────
  getCurrentUser() {
    try { return JSON.parse(localStorage.getItem('sc_user')) || null; }
    catch { return null; }
  },

  async login(email, password) {
    const hash = await hashPassword(password);
    const rows = await this._q('users',
      `?email=eq.${encodeURIComponent(email.trim().toLowerCase())}`);
    const user = rows[0];
    if (!user) throw new Error('등록되지 않은 이메일입니다.');
    if (user.password_hash !== hash) throw new Error('비밀번호가 올바르지 않습니다.');
    const userData = {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role
    };
    localStorage.setItem('sc_user', JSON.stringify(userData));
    return userData;
  },

  logout() {
    localStorage.removeItem('sc_user');
    window.location.href = 'login.html';
  },

  // role 배열에 없으면 리디렉션. 반환값: user 또는 null
  requireAuth(allowedRoles = []) {
    const user = this.getCurrentUser();
    if (!user) { window.location.href = 'login.html'; return null; }
    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
      alert('접근 권한이 없습니다.');
      this._redirectByRole(user.role);
      return null;
    }
    return user;
  },

  _redirectByRole(role) {
    const map = {
      admin: 'admin-dashboard.html',
      tutor: 'tutor-dashboard.html',
      student: 'student-page.html',
      parent: 'parent-page.html',
    };
    window.location.href = map[role] || 'login.html';
  },

  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  },

  isTutor() {
    const user = this.getCurrentUser();
    return user && user.role === 'tutor';
  },

  isStaff() {
    const user = this.getCurrentUser();
    return user && (user.role === 'admin' || user.role === 'tutor');
  },

  async changePassword(newPassword, currentPassword = null, userId = null) {
    // 첫 번째 인자가 새 비밀번호, 두 번째(선택)가 현재 비밀번호 검증용
    const targetId = userId || this.getCurrentUser()?.id;
    if (!targetId) throw new Error('로그인이 필요합니다.');
    if (!newPassword || newPassword.length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
    if (currentPassword) {
      // 현재 비밀번호 검증
      const rows = await this._q('users', `?id=eq.${targetId}`);
      const user = rows[0];
      if (!user) throw new Error('사용자를 찾을 수 없습니다.');
      const currentHash = await hashPassword(currentPassword);
      if (user.password_hash !== currentHash) throw new Error('현재 비밀번호가 올바르지 않습니다.');
    }
    const hash = await hashPassword(newPassword);
    await this.update('users', targetId, { password_hash: hash });
  },

  // ── 온보딩 ────────────────────────────────────────────────────
  async getOnboarding(userId) {
    const rows = await this._q('onboarding', `?user_id=eq.${userId}`);
    return rows[0] || null;
  },

  async isOnboardingComplete(userId) {
    const ob = await this.getOnboarding(userId);
    if (!ob) return false;
    return ob.consent_signed && ob.survey_completed;
  },

  async saveConsent(userId) {
    const existing = await this.getOnboarding(userId);
    if (existing) {
      return this.update('onboarding', existing.id, {
        consent_signed: true,
        consent_signed_at: new Date().toISOString()
      });
    } else {
      return this.insert('onboarding', {
        user_id: userId,
        consent_signed: true,
        consent_signed_at: new Date().toISOString()
      });
    }
  },

  async saveSurvey(userId, surveyData) {
    const existing = await this.getOnboarding(userId);
    if (existing) {
      return this.update('onboarding', existing.id, {
        survey_completed: true,
        survey_completed_at: new Date().toISOString(),
        survey_data: surveyData
      });
    } else {
      return this.insert('onboarding', {
        user_id: userId,
        survey_completed: true,
        survey_completed_at: new Date().toISOString(),
        survey_data: surveyData
      });
    }
  },

  // ── 사용자 관리 (관리자 전용) ─────────────────────────────────
  async createUserAccount(email, displayName, role) {
    const hash = await hashPassword('1234');
    return this.insert('users', {
      email: email.trim().toLowerCase(),
      display_name: displayName,
      role,
      password_hash: hash,
      created_at: new Date().toISOString()
    });
  },

  async getUserById(userId) {
    const rows = await this._q('users', `?id=eq.${userId}`);
    return rows[0] || null;
  },

  async getAllUsers() {
    return this._q('users', '?order=created_at.asc');
  },

  async getAllTutors() {
    return this._q('users', `?role=eq.tutor&order=display_name.asc`);
  },

  // ── 학생 관리 ─────────────────────────────────────────────────
  async getAllStudents() {
    return this._q('students',
      '?order=name.asc&select=*,student_user:users!user_id(id,email,display_name),parent_user:users!parent_user_id(id,email,display_name),tutor:users!tutor_id(id,email,display_name)'
    );
  },

  async getStudent(id) {
    const rows = await this._q('students',
      `?id=eq.${id}&select=*,student_user:users!user_id(id,email,display_name),parent_user:users!parent_user_id(id,email,display_name),tutor:users!tutor_id(id,email,display_name)`
    );
    return rows[0] || null;
  },

  async getStudentByUserId(userId) {
    const rows = await this._q('students', `?user_id=eq.${userId}`);
    return rows[0] || null;
  },

  async getStudentByParentId(parentUserId) {
    const rows = await this._q('students', `?parent_user_id=eq.${parentUserId}`);
    return rows[0] || null;
  },

  // 학부모의 자녀 student_id 반환 (접근제어용 헬퍼)
  async getMyChildId(parentUserId) {
    const student = await this.getStudentByParentId(parentUserId);
    return student ? student.id : null;
  },

  async getTutorStudents(tutorId) {
    return this._q('students',
      `?tutor_id=eq.${tutorId}&order=name.asc`
    );
  },

  async createStudent(data) {
    // data: { name, school, grade, class_num, student_num, target_grade,
    //         student_type, monthly_fee, student_email, parent_email, tutor_id, notes }
    const studentUser = await this.createUserAccount(
      data.student_email, data.name, 'student'
    );
    const parentEmail = data.parent_email ||
      data.student_email.replace('@', '+parent@');
    const parentUser = await this.createUserAccount(
      parentEmail, data.name + ' 학부모', 'parent'
    );
    const student = await this.insert('students', {
      name: data.name,
      school: data.school,
      grade: data.grade,
      class_num: data.class_num || null,
      student_num: data.student_num || null,
      target_grade: data.target_grade || null,
      student_type: data.student_type || null,
      monthly_fee: data.monthly_fee || 70000,
      user_id: studentUser.id,
      parent_user_id: parentUser.id,
      tutor_id: data.tutor_id || null,
      notes: data.notes || null,
      enrolled_at: new Date().toISOString()
    });
    return {
      student,
      studentUser,
      parentUser,
      studentEmail: studentUser.email,
      parentEmail: parentUser.email,
      defaultPassword: '1234'
    };
  },

  async updateStudent(id, patch) {
    return this.update('students', id, patch);
  },

  // ── 수행평가 ──────────────────────────────────────────────────
  async getAllAssignments() {
    return this._q('assignments',
      '?order=school_deadline.asc.nullslast&select=*,student:students(id,name,school,grade)'
    );
  },

  async getStudentAssignments(studentId) {
    return this._q('assignments',
      `?student_id=eq.${studentId}&order=school_deadline.asc.nullslast`
    );
  },

  async getTutorAssignments(tutorId) {
    // 강사 담당 학생들의 수행평가
    const students = await this.getTutorStudents(tutorId);
    if (!students.length) return [];
    const ids = students.map(s => s.id).join(',');
    return this._q('assignments',
      `?student_id=in.(${ids})&order=school_deadline.asc.nullslast&select=*,student:students(id,name,school,grade)`
    );
  },

  async getAssignment(id) {
    const rows = await this._q('assignments',
      `?id=eq.${id}&select=*,student:students(id,name,school,grade,user_id,parent_user_id,tutor_id)`
    );
    return rows[0] || null;
  },

  async createAssignment(data) {
    const user = this.getCurrentUser();
    const schoolDeadline = data.school_deadline || null;
    const internalDeadline = schoolDeadline
      ? this._addDays(schoolDeadline, -5)
      : null;
    return this.insert('assignments', {
      student_id: data.student_id,
      subject: data.subject,
      title: data.title,
      type: data.type || null,
      max_score: data.max_score || null,
      school_deadline: schoolDeadline,
      internal_deadline: data.internal_deadline || internalDeadline,
      stage: '접수',
      created_by: user?.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  },

  async updateAssignment(id, patch) {
    return this.update('assignments', id, {
      ...patch,
      updated_at: new Date().toISOString()
    });
  },

  async updateStage(assignmentId, stage) {
    return this.update('assignments', assignmentId, {
      stage,
      updated_at: new Date().toISOString()
    });
  },

  // data: { score, grade, teacher_comment, growth_note }
  async recordResult(assignmentId, data) {
    const payload = {
      score:           data.score           != null ? data.score           : null,
      grade:           data.grade           || null,
      teacher_comment: data.teacher_comment || null,
      growth_note:     data.growth_note     || null,
      // T2 필드
      expected_score:      data.expected_score  != null ? Number(data.expected_score)  : null,
      revision_count:      data.revision_count  != null ? Number(data.revision_count)  : null,
      cliche_removed:      data.cliche_removed  != null ? Boolean(data.cliche_removed) : null,
      structure_explained: data.structure_explained != null ? Boolean(data.structure_explained) : null,
      interview_minutes:   data.interview_minutes != null ? Number(data.interview_minutes) : null,
      feedback_minutes:    data.feedback_minutes  != null ? Number(data.feedback_minutes)  : null,
      final_minutes:       data.final_minutes     != null ? Number(data.final_minutes)     : null,
      updated_at:          new Date().toISOString()
    };
    // null 값은 제거하지 않음 — 명시적으로 null 업데이트 허용
    return this.update('assignments', assignmentId, payload);
  },

  _addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().substring(0, 10);
  },

  // ── 파일 ──────────────────────────────────────────────────────
  async getAllFiles() {
    return this._q('files',
      '?order=uploaded_at.desc&select=*,student:students!student_id(name),assignment:assignments!assignment_id(title,subject)'
    );
  },

  async getFiles(assignmentId) {
    return this._q('files',
      `?assignment_id=eq.${assignmentId}&order=uploaded_at.asc`
    );
  },

  async getStudentFiles(studentId) {
    return this._q('files',
      `?student_id=eq.${studentId}&assignment_id=is.null&order=uploaded_at.asc`
    );
  },

  async uploadFile(file, studentId, assignmentId, fileType, note = '') {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`파일 크기 초과 (최대 10MB, 현재 ${(file.size/1024/1024).toFixed(1)}MB)`);
    }
    const uploader = this.getCurrentUser();
    const timestamp = Date.now();
    // 파일명에서 경로 구분자·특수문자 제거 (한글·영숫자·점·하이픈은 유지)
    const safeName = file.name.replace(/[/\\?%*:|"<>]/g, '_');
    const path = `${studentId}/${assignmentId || 'general'}/${timestamp}_${safeName}`;
    // URL 경로 각 세그먼트를 인코딩 — 한글 파일명이 있어도 Supabase Storage에 안전하게 전달
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    // HWP 등 브라우저가 MIME 타입을 모르는 경우 octet-stream으로 fallback
    const contentType = file.type || 'application/octet-stream';

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': contentType,
          'x-upsert': 'false'
        },
        body: file
      }
    );
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error('파일 업로드 실패: ' + err);
    }

    // file_url에도 인코딩된 경로 사용 (한글 포함 URL이 깨지지 않도록)
    const file_url = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`;
    return this.insert('files', {
      assignment_id: assignmentId || null,
      student_id: studentId,
      uploader_id: uploader?.id,
      uploader_role: uploader?.role,
      file_type: fileType,
      file_name: file.name,   // 원본 파일명(한글 포함)은 그대로 보관 — 화면 표시용
      file_url,
      file_size: file.size,
      note,
      uploaded_at: new Date().toISOString()
    });
  },

  async deleteFile(fileId) {
    return this.delete('files', fileId);
  },

  // ── 메모 ──────────────────────────────────────────────────────

  // 메모 목록 (author join 포함)
  async getMemosFull(assignmentId) {
    return this._q('memos',
      `?assignment_id=eq.${assignmentId}&order=created_at.asc&select=*,author:users!author_id(display_name,role)`
    );
  },

  // 수행평가 메모 추가
  // memoType: '면담' | '피드백' | '특이사항' | '성장' (DB NOT NULL 컬럼)
  async addMemo(assignmentId, content, studentId = null, memoType = '면담') {
    const user = this.getCurrentUser();
    return this.insert('memos', {
      assignment_id: assignmentId || null,
      student_id: studentId || null,
      author_id: user?.id,
      memo_type: memoType,
      content,
      created_at: new Date().toISOString()
    });
  },

  // ── 대시보드 통계 (관리자용) ──────────────────────────────────
  async getAdminStats() {
    const [students, assignments] = await Promise.all([
      this.getAllStudents(),
      this.getAllAssignments()
    ]);
    const today = new Date(); today.setHours(0,0,0,0);
    const inProgress = assignments.filter(a => a.stage !== '완료');
    const urgent = inProgress.filter(a => {
      if (!a.internal_deadline && !a.school_deadline) return false;
      const dl = new Date(a.internal_deadline || a.school_deadline);
      const diff = Math.ceil((dl - today) / 86400000);
      return diff <= 5;  // 마감 초과(음수)도 긴급 포함
    });
    const completedThisMonth = assignments.filter(a => {
      if (a.stage !== '완료') return false;
      const d = new Date(a.updated_at);
      return d.getFullYear() === today.getFullYear() &&
             d.getMonth() === today.getMonth();
    });
    return {
      totalStudents: students.length,
      inProgressCount: inProgress.length,
      urgentCount: urgent.length,
      completedThisMonth: completedThisMonth.length,
      students,
      assignments
    };
  },

  // ── 온보딩 현황 (관리자용) ────────────────────────────────────
  async getOnboardingStatus() {
    return this._q('onboarding', '?order=created_at.asc');
  },

  // ── 내부자료 (관리자·강사 전용) ────────────────────────────────
  // files 테이블에서 student_id=null & assignment_id=null 인 레코드를 내부자료로 사용
  async getInternalDocs() {
    return this._q('files',
      '?student_id=is.null&assignment_id=is.null&order=uploaded_at.desc'
    );
  },

  // 내부자료 파일 직접 업로드 → Supabase Storage → public URL 반환
  async uploadInternalFile(file) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`파일 크기 초과 (최대 10MB, 현재 ${(file.size/1024/1024).toFixed(1)}MB)`);
    }
    const timestamp = Date.now();
    const safeName = file.name.replace(/[/\\?%*:|"<>]/g, '_');
    const path = `internal/${timestamp}_${safeName}`;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const contentType = file.type || 'application/octet-stream';
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': contentType,
          'x-upsert': 'true'
        },
        body: file
      }
    );
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error('파일 업로드 실패: ' + err);
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`;
  },

  async addInternalDoc(data) {
    // data: { file_name, file_url, note, uploader_id, uploader_role, file_type, file_size, uploaded_at }
    return this.insert('files', {
      assignment_id: null,
      student_id:    null,
      uploader_id:   data.uploader_id   || null,
      uploader_role: data.uploader_role || 'admin',
      file_type:     data.file_type     || '기타',
      file_name:     data.file_name,
      file_url:      data.file_url      || null,
      file_size:     data.file_size     || 0,
      note:          data.note          || null,
      uploaded_at:   data.uploaded_at   || new Date().toISOString()
    });
  },

  // ── D-Day 헬퍼 ────────────────────────────────────────────────
  getDDay(deadlineStr) {
    if (!deadlineStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((new Date(deadlineStr) - today) / 86400000);
    if (diff === 0) return 'D-Day';
    if (diff > 0) return `D-${diff}`;
    return `D+${Math.abs(diff)}`;
  },

  getDDayClass(deadlineStr) {
    if (!deadlineStr) return 'dday-none';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((new Date(deadlineStr) - today) / 86400000);
    if (diff < 0) return 'dday-overdue';
    if (diff <= 3) return 'dday-urgent';
    if (diff <= 7) return 'dday-warning';
    return 'dday-safe';
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

  formatFileSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'KB';
    return (bytes/1024/1024).toFixed(1) + 'MB';
  },

  // ── Excel 내보내기 ────────────────────────────────────────────
  async exportStudents() {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS 미로드');
    const students = await this.getAllStudents();
    const data = students.map(s => ({
      '이름': s.name,
      '학교': s.school,
      '학년': s.grade + '학년',
      '반': s.class_num ? s.class_num + '반' : '-',
      '번호': s.student_num ? s.student_num + '번' : '-',
      '목표등급': s.target_grade || '-',
      '학생유형': s.student_type || '-',
      '월비용': s.monthly_fee ? s.monthly_fee.toLocaleString() + '원' : '-',
      '등록일': this.formatDate(s.enrolled_at),
      '학생이메일': s.student_user?.email || '-',
      '학부모이메일': s.parent_user?.email || '-',
      '담당강사': s.tutor?.display_name || '-',
      '메모': s.notes || ''
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [10,16,8,6,6,10,10,12,12,22,22,12,20].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, '학생목록');
    XLSX.writeFile(wb, `수코치_학생목록_${new Date().toISOString().substring(0,10)}.xlsx`);
  },

  async exportAssignments() {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS 미로드');
    const assignments = await this.getAllAssignments();
    const data = assignments.map(a => {
      const s = a.student || {};
      const dday = this.getDDay(a.internal_deadline || a.school_deadline);
      return {
        '학생': s.name || '-',
        '학교': s.school || '-',
        '학년': s.grade ? s.grade + '학년' : '-',
        '과목': a.subject,
        '수행평가명': a.title,
        '유형': a.type || '-',
        '학교마감': this.formatDate(a.school_deadline),
        '내부마감': this.formatDate(a.internal_deadline),
        'D-Day': dday || '-',
        '단계': a.stage,
        '만점': a.max_score || '-',
        '예상점수': a.expected_score != null ? a.expected_score : '-',
        '취득점수': a.score          != null ? a.score          : '-',
        '등급': a.grade || '-',
        '수정횟수': a.revision_count != null ? a.revision_count : '-',
        '면담시간(분)': a.interview_minutes || '-',
        '피드백시간(분)': a.feedback_minutes || '-',
        '최종확인시간(분)': a.final_minutes || '-',
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [10,14,8,8,22,10,12,12,8,10,8,10,8,8,10,12,14,16].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, '수행평가현황');
    XLSX.writeFile(wb, `수코치_수행평가현황_${new Date().toISOString().substring(0,10)}.xlsx`);
  },

  // ── 토스트 알림 ────────────────────────────────────────────────
  // type: 'success' | 'error' | 'info'
  toast(msg, type = 'success') {
    // 스타일 미등록 시 동적 삽입
    if (!document.getElementById('sc-toast-style')) {
      const s = document.createElement('style');
      s.id = 'sc-toast-style';
      s.textContent = `
        #sc-toast-container { position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
          z-index:9999; display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; }
        .sc-toast { padding:12px 20px; border-radius:10px; font-size:14px; font-weight:600;
          color:white; opacity:0; transform:translateY(8px); transition:all 0.3s ease;
          pointer-events:none; white-space:nowrap; max-width:90vw; overflow:hidden; text-overflow:ellipsis; }
        .sc-toast.show { opacity:1; transform:translateY(0); }
        .sc-toast.success { background:#059669; }
        .sc-toast.error   { background:#DC2626; }
        .sc-toast.info    { background:#4F46E5; }
      `;
      document.head.appendChild(s);
    }
    if (!document.getElementById('sc-toast-container')) {
      const c = document.createElement('div');
      c.id = 'sc-toast-container';
      document.body.appendChild(c);
    }
    const t = document.createElement('div');
    t.className = 'sc-toast ' + type;
    t.textContent = msg;
    document.getElementById('sc-toast-container').appendChild(t);
    requestAnimationFrame(() => { t.classList.add('show'); });
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 2800);
  }
};
