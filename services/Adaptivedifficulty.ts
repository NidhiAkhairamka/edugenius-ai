/**
 * EduGenius — Adaptive Difficulty Engine
 *
 * Replaces the naive "AssessmentAgent says newDifficulty" approach.
 * Instead, this engine maintains a rolling performance window and uses
 * statistical signals — not just the last answer — to decide level.
 *
 * HOW IT WORKS:
 *   - Maintains a sliding window of the last N answers per topic
 *   - Tracks streaks, accuracy trends, and speed (future)
 *   - Applies hysteresis: you need 3 wins to go UP, 2 losses to go DOWN
 *     (prevents bouncing between levels on single answers)
 *   - Adjusts question generation prompts with performance context
 *   - Writes full history to localStorage for Statistics analytics
 *
 * INTEGRATION:
 *   Replace the difficulty update in LearningArena.vue submitAnswer() with:
 *     const adapter = new AdaptiveDifficultyEngine(props.topic.id, props.student.name);
 *     difficulty.value = adapter.recordAnswer(res.isCorrect, difficulty.value);
 */

import { Difficulty } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnswerRecord {
  timestamp: string;
  difficulty: Difficulty;
  isCorrect: boolean;
  questionTopic: string;
}

export interface PerformanceWindow {
  topicId: string;
  studentName: string;
  history: AnswerRecord[];         // sliding window
  currentDifficulty: Difficulty;
  consecutiveCorrect: number;      // streak up
  consecutiveWrong: number;        // streak down
  totalAttempts: number;
  totalCorrect: number;
  lastUpdated: string;
}

export interface DifficultyContext {
  difficulty: Difficulty;
  performanceSummary: string;      // injected into question prompt
  recentAccuracy: number;          // 0-100
  trend: 'improving' | 'declining' | 'stable';
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  WINDOW_SIZE: 10,          // how many recent answers to track
  PROMOTE_STREAK: 3,        // correct in a row to go UP a level
  DEMOTE_STREAK: 2,         // wrong in a row to go DOWN a level
  PROMOTE_ACCURACY: 75,     // rolling accuracy % to consider promotion
  DEMOTE_ACCURACY: 35,      // rolling accuracy % to force demotion
  STORAGE_KEY_PREFIX: 'edugenius_difficulty_',
};

const DIFFICULTY_ORDER: Difficulty[] = [
  Difficulty.BEGINNER,
  Difficulty.INTERMEDIATE,
  Difficulty.ADVANCED,
];

// ─── Engine ───────────────────────────────────────────────────────────────────

export class AdaptiveDifficultyEngine {
  private topicId: string;
  private studentName: string;
  private state: PerformanceWindow;

  constructor(topicId: string, studentName: string, initialDifficulty: Difficulty = Difficulty.BEGINNER) {
    this.topicId = topicId;
    this.studentName = studentName;
    this.state = this.loadState(initialDifficulty);
  }

  private storageKey(): string {
    return `${CONFIG.STORAGE_KEY_PREFIX}${this.studentName}_${this.topicId}`;
  }

  private loadState(initialDifficulty: Difficulty): PerformanceWindow {
    try {
      const saved = localStorage.getItem(this.storageKey());
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('AdaptiveDifficulty: Could not load state.', e);
    }
    return {
      topicId: this.topicId,
      studentName: this.studentName,
      history: [],
      currentDifficulty: initialDifficulty,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      totalAttempts: 0,
      totalCorrect: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  private saveState(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this.state));
    } catch (e) {
      console.warn('AdaptiveDifficulty: Could not save state.', e);
    }
  }

  /** Rolling accuracy over the last WINDOW_SIZE answers */
  private rollingAccuracy(): number {
    const window = this.state.history.slice(-CONFIG.WINDOW_SIZE);
    if (!window.length) return 50; // neutral default
    const correct = window.filter(r => r.isCorrect).length;
    return Math.round((correct / window.length) * 100);
  }

  /** Trend: compare first half vs second half of window */
  private trend(): 'improving' | 'declining' | 'stable' {
    const window = this.state.history.slice(-CONFIG.WINDOW_SIZE);
    if (window.length < 4) return 'stable';
    const mid = Math.floor(window.length / 2);
    const firstHalf = window.slice(0, mid).filter(r => r.isCorrect).length / mid;
    const secondHalf = window.slice(mid).filter(r => r.isCorrect).length / (window.length - mid);
    const delta = secondHalf - firstHalf;
    if (delta > 0.2) return 'improving';
    if (delta < -0.2) return 'declining';
    return 'stable';
  }

  private currentIndex(): number {
    return DIFFICULTY_ORDER.indexOf(this.state.currentDifficulty);
  }

  private promoteLevel(): Difficulty {
    const idx = this.currentIndex();
    return DIFFICULTY_ORDER[Math.min(idx + 1, DIFFICULTY_ORDER.length - 1)];
  }

  private demoteLevel(): Difficulty {
    const idx = this.currentIndex();
    return DIFFICULTY_ORDER[Math.max(idx - 1, 0)];
  }

  /**
   * Record an answer and return the new recommended difficulty.
   * Call this after every AssessmentAgent.assess() call.
   */
  recordAnswer(isCorrect: boolean, currentDifficulty: Difficulty): Difficulty {
    // Update state
    this.state.currentDifficulty = currentDifficulty;
    this.state.totalAttempts++;
    if (isCorrect) {
      this.state.totalCorrect++;
      this.state.consecutiveCorrect++;
      this.state.consecutiveWrong = 0;
    } else {
      this.state.consecutiveWrong++;
      this.state.consecutiveCorrect = 0;
    }

    // Push to history window
    this.state.history.push({
      timestamp: new Date().toISOString(),
      difficulty: currentDifficulty,
      isCorrect,
      questionTopic: this.topicId,
    });
    // Keep only recent window for storage efficiency
    if (this.state.history.length > CONFIG.WINDOW_SIZE * 2) {
      this.state.history = this.state.history.slice(-CONFIG.WINDOW_SIZE * 2);
    }

    // ── Decide new difficulty ───────────────────────────────────────────────
    const accuracy = this.rollingAccuracy();
    let newDifficulty = currentDifficulty;

    // PROMOTE: Need streak OR sustained accuracy
    const shouldPromote =
      this.state.consecutiveCorrect >= CONFIG.PROMOTE_STREAK ||
      (accuracy >= CONFIG.PROMOTE_ACCURACY && this.state.history.length >= CONFIG.WINDOW_SIZE);

    // DEMOTE: Need streak OR sustained low accuracy
    const shouldDemote =
      this.state.consecutiveWrong >= CONFIG.DEMOTE_STREAK ||
      (accuracy <= CONFIG.DEMOTE_ACCURACY && this.state.history.length >= 4);

    if (shouldPromote && this.currentIndex() < DIFFICULTY_ORDER.length - 1) {
      newDifficulty = this.promoteLevel();
      this.state.consecutiveCorrect = 0; // reset after promotion
      console.info(`AdaptiveDifficulty: ↑ PROMOTED to ${newDifficulty} (streak: ${this.state.consecutiveCorrect}, acc: ${accuracy}%)`);
    } else if (shouldDemote && this.currentIndex() > 0) {
      newDifficulty = this.demoteLevel();
      this.state.consecutiveWrong = 0; // reset after demotion
      console.info(`AdaptiveDifficulty: ↓ DEMOTED to ${newDifficulty} (streak: ${this.state.consecutiveWrong}, acc: ${accuracy}%)`);
    }

    this.state.currentDifficulty = newDifficulty;
    this.state.lastUpdated = new Date().toISOString();
    this.saveState();
    return newDifficulty;
  }

  /**
   * Returns context to inject into question generation prompts.
   * This makes the AI aware of the student's current performance pattern.
   */
  getDifficultyContext(): DifficultyContext {
    const accuracy = this.rollingAccuracy();
    const t = this.trend();

    let summary = '';
    if (this.state.totalAttempts < 3) {
      summary = `New to this topic. Start with fundamentals.`;
    } else if (t === 'improving' && accuracy > 60) {
      summary = `Student is improving (${accuracy}% recent accuracy). Push towards application questions.`;
    } else if (t === 'declining' || accuracy < 40) {
      summary = `Student is struggling (${accuracy}% recent accuracy). Focus on conceptual understanding, avoid trick questions.`;
    } else if (this.state.consecutiveCorrect >= 2) {
      summary = `Student is on a ${this.state.consecutiveCorrect}-answer streak. Maintain challenge.`;
    } else {
      summary = `Student is steady at ${accuracy}% accuracy. Standard difficulty appropriate.`;
    }

    return {
      difficulty: this.state.currentDifficulty,
      performanceSummary: summary,
      recentAccuracy: accuracy,
      trend: t,
    };
  }

  /** Get full performance state (for Statistics panel) */
  getState(): PerformanceWindow {
    return { ...this.state };
  }

  /** Overall accuracy across all attempts */
  overallAccuracy(): number {
    if (!this.state.totalAttempts) return 0;
    return Math.round((this.state.totalCorrect / this.state.totalAttempts) * 100);
  }

  /** Reset state for a topic (e.g. when student retakes) */
  reset(): void {
    this.state = {
      topicId: this.topicId,
      studentName: this.studentName,
      history: [],
      currentDifficulty: Difficulty.BEGINNER,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      totalAttempts: 0,
      totalCorrect: 0,
      lastUpdated: new Date().toISOString(),
    };
    this.saveState();
  }

  /** Get all difficulty states across all topics for a student (for analytics) */
  static getAllStates(studentName: string): PerformanceWindow[] {
    const states: PerformanceWindow[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${CONFIG.STORAGE_KEY_PREFIX}${studentName}_`)) {
        try {
          const val = localStorage.getItem(key);
          if (val) states.push(JSON.parse(val));
        } catch (e) { /* skip */ }
      }
    }
    return states;
  }
}

// ─── LearningArena Integration Patch ─────────────────────────────────────────
/**
 * In LearningArena.vue, make these changes:
 *
 * 1. Import at top:
 *    import { AdaptiveDifficultyEngine } from '../services/adaptiveDifficulty';
 *
 * 2. Add engine instance (after const difficulty = ref(...)):
 *    const difficultyEngine = ref(null);
 *
 * 3. In loadState(), initialise the engine:
 *    difficultyEngine.value = new AdaptiveDifficultyEngine(
 *      props.topic.id,
 *      props.student.name,
 *      difficulty.value
 *    );
 *
 * 4. In fetchQuestion(), replace the logicProfile line with:
 *    const context = difficultyEngine.value?.getDifficultyContext();
 *    const logicProfile = (context?.performanceSummary || '') + ' ' +
 *      (notebookHubData.value?.logicProfile || curriculumFallback.value?.logicProfile?.explanation || '');
 *    // Also use context.difficulty as the difficulty passed to generateValidatedQuestion
 *
 * 5. In submitAnswer(), REPLACE:
 *    difficulty.value = res.newDifficulty;
 *    WITH:
 *    difficulty.value = difficultyEngine.value.recordAnswer(res.isCorrect, difficulty.value);
 *
 * That's the full integration. The engine now controls difficulty, not the AssessmentAgent alone.
 */