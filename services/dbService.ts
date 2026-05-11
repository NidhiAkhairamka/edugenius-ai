import { StudentProfile } from "../types";

const API_BASE = 'http://192.168.1.69:5000/api';

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

  // --- Static Content Bank (pre-generated, no AI call) ---

  async getStaticCurriculum(topicId: string): Promise<any | null> {
    try {
      const r = await fetch(`${API_BASE}/curriculum/static/${topicId}`);
      if (r.status === 404) return null;
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  async getStaticQuestion(
    topicId: string,
    difficulty: string,
    yearLevel: number,
    usedIds: string[] = []
  ): Promise<any | null> {
    try {
      const r = await fetch(`${API_BASE}/question/static`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId, difficulty, yearLevel, usedIds })
      });
      if (r.status === 404) return null; // bank exhausted — caller uses live AI
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

  // --- Granular Synthesis & Flashcards ---
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