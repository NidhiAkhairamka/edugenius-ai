import { StudentProfile } from "../types";

/**
 * Resolve the API base URL defensively. VITE_API_URL has historically been set
 * inconsistently (sometimes the bare host `web-production-...railway.app` with
 * no protocol and no `/api` suffix), which silently broke every db call because
 * `fetch` then treated it as a relative path. Normalise to a full origin + /api
 * so it works regardless of how the env var is configured.
 */
function resolveApiBase(): string {
  let base: string = (import.meta as any).env.VITE_API_URL || 'http://localhost:5000/api';
  base = base.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;   // bare host -> https://host
  if (!/\/api$/i.test(base)) base = base + '/api';             // ensure /api path
  return base;
}

const API_BASE = resolveApiBase();

class DatabaseManager {
  async init(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/health`);
      return response.ok;
    } catch (e) {
      console.error("DB Engine Offline at", API_BASE);
      return false;
    }
  }

  async saveProfile(profile: StudentProfile): Promise<void> {
    await fetch(`${API_BASE}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
  }

  async getProfile(name: string): Promise<StudentProfile | null> {
    try {
      const r = await fetch(`${API_BASE}/profile/${name}`);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  // ── ACCOUNTS: parent (email) + child (username) ───────────────────────────

  async parentSignup(email: string, password: string, displayName = ''): Promise<{ ok: boolean; profile?: any; error?: string }> {
    try {
      const r = await fetch(`${API_BASE}/auth/parent/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName })
      });
      const data = await r.json();
      return r.ok ? { ok: true, profile: data.profile } : { ok: false, error: data.error };
    } catch (e) { return { ok: false, error: 'network' }; }
  }

  async parentLogin(email: string, password: string): Promise<{ ok: boolean; profile?: any; error?: string }> {
    try {
      const r = await fetch(`${API_BASE}/auth/parent/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json();
      return r.ok ? { ok: true, profile: data.profile } : { ok: false, error: data.error };
    } catch (e) { return { ok: false, error: 'network' }; }
  }

  async childLogin(username: string, password: string): Promise<{ ok: boolean; profile?: any; error?: string }> {
    try {
      const r = await fetch(`${API_BASE}/auth/child/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await r.json();
      return r.ok ? { ok: true, profile: data.profile } : { ok: false, error: data.error };
    } catch (e) { return { ok: false, error: 'network' }; }
  }

  /** Parent creates a child account during onboarding. */
  async createChild(payload: {
    parentEmail: string; username: string; password: string;
    displayName?: string; ageBand?: string; targetExam?: string; yearLevel?: number;
    reports?: any; aiAnalysis?: string; recommendedLevel?: string;
  }): Promise<{ ok: boolean; profile?: any; error?: string }> {
    try {
      const r = await fetch(`${API_BASE}/auth/child/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, createdAt: new Date().toISOString() })
      });
      const data = await r.json();
      return r.ok ? { ok: true, profile: data.profile } : { ok: false, error: data.error };
    } catch (e) { return { ok: false, error: 'network' }; }
  }

  async getChildren(parentEmail: string): Promise<any[]> {
    try {
      const r = await fetch(`${API_BASE}/children/${encodeURIComponent(parentEmail)}`);
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  // --- Curriculum Cache ---
  async getCurriculum(topicId: string): Promise<any | null> {
    try {
      const r = await fetch(`${API_BASE}/curriculum/${topicId}`);
      if (r.status === 404) return null;
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  async saveCurriculum(data: any): Promise<void> {
    await fetch(`${API_BASE}/curriculum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  async getStaticCurriculum(topicId: string): Promise<any | null> {
    try {
      const r = await fetch(`${API_BASE}/curriculum/static/${topicId}`);
      if (r.status === 404) return null;
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  // --- Synthesis & Flashcards ---
  async saveTopicSynthesis(studentName: string, topicId: string, data: any): Promise<void> {
    await fetch(`${API_BASE}/synthesis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, topicId, data })
    });
  }

  async getTopicSynthesis(studentName: string, topicId: string): Promise<any | null> {
    try {
      const r = await fetch(`${API_BASE}/synthesis/${studentName}/${topicId}`);
      if (r.status === 404) return null;
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  async saveFlashcards(studentName: string, topicId: string, cards: any[]): Promise<void> {
    await fetch(`${API_BASE}/flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, topicId, cards })
    });
  }

  async getFlashcards(studentName: string, topicId: string): Promise<any[]> {
    try {
      const r = await fetch(`${API_BASE}/flashcards/${studentName}/${topicId}`);
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  async saveQuestionLog(log: any): Promise<void> {
    await fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    });
  }

  async getQuestionLogs(name: string): Promise<any[]> {
    try {
      const r = await fetch(`${API_BASE}/logs/${name}`);
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  // --- Vault Methods ---
  async saveAgentEye(studentName: string, topicId: string, worksheet: any): Promise<void> {
    await fetch(`${API_BASE}/vault/agent_eye`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...worksheet, studentName, topicId })
    });
  }

  async getAgentEyeVault(studentName: string, topicId: string): Promise<any[]> {
    try {
      const r = await fetch(`${API_BASE}/vault/agent_eye/${studentName}/${topicId}`);
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  async deleteAgentEye(id: string): Promise<void> {
    await fetch(`${API_BASE}/vault/agent_eye/${id}`, { method: 'DELETE' });
  }

  async saveBriefing(studentName: string, topicId: string, worksheet: any): Promise<void> {
    await fetch(`${API_BASE}/vault/briefing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...worksheet, studentName, topicId })
    });
  }

  async getBriefingVault(studentName: string, topicId: string): Promise<any[]> {
    try {
      const r = await fetch(`${API_BASE}/vault/briefing/${studentName}/${topicId}`);
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  async deleteBriefing(id: string): Promise<void> {
    await fetch(`${API_BASE}/vault/briefing/${id}`, { method: 'DELETE' });
  }

  async getAllAgentEyeForUser(name: string): Promise<any[]> {
    try {
      const r = await fetch(`${API_BASE}/vault/agent_eye/${name}/all`);
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  async getAllBriefingForUser(name: string): Promise<any[]> {
    try {
      const r = await fetch(`${API_BASE}/vault/briefing/${name}/all`);
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  // ── DIAGNOSTIC METHODS ────────────────────────────────────────────────────
  // Phase 1 & 2 — save per-question results, retrieve skill map

  /**
   * Save a single diagnostic answer with full skill node mapping.
   * Called after every question answered in the adaptive diagnostic.
   */
  async saveDiagnosticResult(result: {
    studentName: string;
    sessionId: string;
    questionId: string;
    skillNode: string;
    skillLevel: number;
    section: string;
    isCorrect: boolean;
    wasSkipped?: boolean;
    studentAnswer?: string;
    correctAnswer?: string;
    timeTakenSecs?: number;
    evidence?: string;
  }): Promise<void> {
    try {
      await fetch(`${API_BASE}/diagnostic/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
    } catch (e) {
      console.error('Failed to save diagnostic result:', e);
    }
  }

  /**
   * Get all diagnostic results for a student.
   * Returns raw per-question records.
   */
  async getDiagnosticResults(studentName: string): Promise<any[]> {
    try {
      const r = await fetch(`${API_BASE}/diagnostic/results/${studentName}`);
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  /**
   * Get computed skill map for a student.
   * Returns per-node confidence scores derived from diagnostic results.
   * Only uses confirmed evidence — never infers or guesses.
   */
  async getSkillMap(studentName: string): Promise<{
    nodes: Record<string, {
      confidence: number;
      source: string;
      evidence: string;
      correct: number;
      attempted: number;
      level: number;
      section: string;
      lastTested: string;
    }>;
    summary: {
      totalTested: number;
      confirmed_strong: number;
      confirmed_gaps: number;
      message: string;
    };
  } | null> {
    try {
      const r = await fetch(`${API_BASE}/diagnostic/skillmap/${studentName}`);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  /**
   * Get results for a specific diagnostic session.
   */
  async getDiagnosticSession(studentName: string, sessionId: string): Promise<any[]> {
    try {
      const r = await fetch(`${API_BASE}/diagnostic/session/${studentName}/${sessionId}`);
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  // ── DIAGNOSTIC QUESTION REVIEW (admin) ────────────────────────────────────

  /** List every draft diagnostic question with review/approval status. */
  async getReviewQuestions(): Promise<{
    total: number;
    reviewed_count: number;
    approved_count: number;
    questions: any[];
  } | null> {
    try {
      const r = await fetch(`${API_BASE}/diagnostic/review/all`);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  /**
   * Update one draft question. Pass edited fields in `question`, and/or flip
   * `reviewed` / `approved`. Approval implies review server-side.
   */
  async updateReviewQuestion(payload: {
    id: string;
    question?: Record<string, any>;
    reviewed?: boolean;
    approved?: boolean;
  }): Promise<{ status: string; reviewed: boolean; approved: boolean } | null> {
    try {
      const r = await fetch(`${API_BASE}/diagnostic/review/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  /** Approved questions only — what the live diagnostic should consume. */
  async getApprovedDiagnosticQuestions(): Promise<{ total: number; questions: Record<string, any> } | null> {
    try {
      const r = await fetch(`${API_BASE}/diagnostic/questions/approved`);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  async migrateFromLegacy(): Promise<StudentProfile | null> {
    const legacy = localStorage.getItem('edugenius_users');
    if (legacy) {
      try {
        const users = JSON.parse(legacy);
        if (users.length) return users[0].profile;
      } catch (e) { return null; }
    }
    return null;
  }
}

export const db = new DatabaseManager();