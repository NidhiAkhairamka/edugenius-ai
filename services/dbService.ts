import { StudentProfile } from "../types";

const API_BASE = (import.meta as any).env.VITE_API_URL || 'http://localhost:5000/api';

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