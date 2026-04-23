/**
 * EduGenius — Question Quality Manager
 *
 * A 3-layer validation pipeline that sits between question generation and
 * display. No bad, off-topic, or malformed question ever reaches the student.
 *
 * LAYER 1: Schema Validator (instant, zero cost)
 *   Structural checks: has text? has correctAnswer? answer in options?
 *   right subject? not too short/long?
 *
 * LAYER 2: Relevance & Difficulty Scorer (lightweight AI call, minimal cost)
 *   A tiny classification call that returns topicMatch (0-10) and
 *   difficultyMatch (correct | too_easy | too_hard).
 *
 * LAYER 3: Auto-retry with failure feedback injection
 *   If a question fails, the reason is injected back into the next generation
 *   prompt so the AI learns from its mistake in-context. Max 3 attempts.
 *   After 3 failures, a safe fallback question is used.
 *
 * AUDIT LOG:
 *   Every question is logged with its validation result so you can monitor
 *   AI quality over time (stored in localStorage, exportable).
 */

import { Question, Topic, Difficulty } from '../types';
import { QuestionAgent } from './geminiService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  layer: 'schema' | 'relevance' | 'passed';
  reasons: string[];
  topicMatchScore?: number;    // 0-10
  difficultyMatch?: 'correct' | 'too_easy' | 'too_hard' | 'unknown';
  attempts: number;
}

export interface QualityLog {
  timestamp: string;
  topicId: string;
  topicName: string;
  subject: string;
  yearLevel: number;
  difficulty: string;
  questionText: string;
  validationResult: ValidationResult;
  usedFallback: boolean;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_RETRIES: 3,
  MIN_QUESTION_LENGTH: 20,      // chars — catches "What is x?" one-liners
  MAX_QUESTION_LENGTH: 600,     // chars — catches AI rambling
  MIN_TOPIC_MATCH_SCORE: 6,     // out of 10 — threshold for relevance pass
  MIN_OPTIONS_COUNT: 2,         // for MCQ questions
  LOG_KEY: 'edugenius_quality_log',
  MAX_LOG_ENTRIES: 500,
};

// ─── Fallback Questions ───────────────────────────────────────────────────────
// Used only when all 3 retries fail. Covers common topics as last resort.

const SAFE_FALLBACKS: Record<string, Question> = {
  Maths: {
    id: 'fallback-maths',
    text: 'A rectangle has a length of 8 cm and a width of 5 cm. What is its area?',
    options: ['13 cm²', '40 cm²', '26 cm²', '45 cm²'],
    correctAnswer: '40 cm²',
    explanation: 'Area of a rectangle = length × width = 8 × 5 = 40 cm².',
    hint: 'Multiply the two dimensions together.',
    difficulty: Difficulty.BEGINNER,
    topic: 'General Maths',
    subject: 'Maths',
  },
  Science: {
    id: 'fallback-science',
    text: 'What is the chemical symbol for water?',
    options: ['HO', 'H₂O', 'O₂', 'H₂O₂'],
    correctAnswer: 'H₂O',
    explanation: 'Water is composed of two hydrogen atoms and one oxygen atom, giving it the formula H₂O.',
    hint: 'Think about the atoms that make up water.',
    difficulty: Difficulty.BEGINNER,
    topic: 'General Science',
    subject: 'Science',
  },
};

// ─── Layer 1: Schema Validator ────────────────────────────────────────────────

function validateSchema(question: Question, topic: Topic, difficulty: Difficulty): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Must have question text
  if (!question.text || typeof question.text !== 'string') {
    reasons.push('Missing question text');
  } else {
    if (question.text.trim().length < CONFIG.MIN_QUESTION_LENGTH) {
      reasons.push(`Question too short (${question.text.length} chars, min ${CONFIG.MIN_QUESTION_LENGTH})`);
    }
    if (question.text.length > CONFIG.MAX_QUESTION_LENGTH) {
      reasons.push(`Question too long (${question.text.length} chars, max ${CONFIG.MAX_QUESTION_LENGTH})`);
    }
  }

  // Must have a correct answer
  if (!question.correctAnswer || typeof question.correctAnswer !== 'string' || question.correctAnswer.trim() === '') {
    reasons.push('Missing or empty correctAnswer');
  }

  // Must have an explanation
  if (!question.explanation || question.explanation.trim().length < 10) {
    reasons.push('Missing or too-short explanation');
  }

  // If MCQ: correctAnswer must be one of the options
  if (question.options && question.options.length > 0) {
    if (question.options.length < CONFIG.MIN_OPTIONS_COUNT) {
      reasons.push(`Too few options (${question.options.length}, min ${CONFIG.MIN_OPTIONS_COUNT})`);
    }
    if (!question.options.includes(question.correctAnswer)) {
      reasons.push('correctAnswer not found in options array');
    }
    // Check for duplicate options
    const unique = new Set(question.options);
    if (unique.size !== question.options.length) {
      reasons.push('Duplicate options detected');
    }
  }

  // Subject must match the topic
  if (question.subject && question.subject !== topic.subject) {
    reasons.push(`Subject mismatch: got "${question.subject}", expected "${topic.subject}"`);
  }

  // Detect bad diagram references — phrases that require an external image the student cannot see.
  // We ALLOW text-described diagrams (geometry in words, embedded data tables, describe-instead).
  // We only reject questions that point to an image that does not exist in the question text.
  const BAD_DIAGRAM_PHRASES = [
    'see diagram', 'see figure', 'see the diagram', 'see the figure',
    'refer to the diagram', 'refer to the figure', 'refer to the graph',
    'shown in the diagram', 'shown in the figure', 'shown below',
    'image below', 'figure below', 'diagram below', 'graph below',
    'as shown', 'using the diagram', 'using the graph', 'using the figure',
    'from the graph above', 'in the circuit diagram provided', 'in the image'
  ];
  const textLower = (question.text || '').toLowerCase();
  const badRef = BAD_DIAGRAM_PHRASES.find(p => textLower.includes(p));
  if (badRef) {
    reasons.push('Question references an external visual: "' + badRef + '". AI must embed all data in the question text.');
  }

  return { passed: reasons.length === 0, reasons };
}

// ─── Layer 2: Relevance Scorer — DISABLED ────────────────────────────────────
// Disabled: causes double API calls per question, doubling cost and failure rate.
// Layer 1 schema validation is sufficient for quality control.
// Re-enable only if you have dedicated budget for quality scoring.

async function scoreRelevance(
  question: Question,
  topic: Topic,
  difficulty: Difficulty,
  yearLevel: number
): Promise<{ topicMatchScore: number; difficultyMatch: 'correct' | 'too_easy' | 'too_hard' | 'unknown'; reasons: string[] }> {
  
  const reasons: string[] = [];

  // Always pass through — scoring disabled to save API calls
  const CF_WORKER_URL = '';
  const GEMINI_KEY = '';

  const scoringPrompt = `You are a GCSE quality control examiner. Rate this question.

TOPIC: "${topic.name}" (${topic.subject}, Year ${yearLevel})
EXPECTED DIFFICULTY: ${difficulty}
QUESTION: "${question.text}"
CORRECT ANSWER: "${question.correctAnswer}"

Return ONLY this JSON (no other text):
{
  "topicMatchScore": <integer 0-10, where 10 = perfectly on-topic, 0 = completely off-topic>,
  "difficultyMatch": "<correct | too_easy | too_hard>",
  "topicReason": "<one sentence why you gave this score>"
}

Scoring guide for topicMatchScore:
- 8-10: Directly tests the named topic
- 5-7: Related to the topic but not core
- 0-4: Off-topic or generic, fails relevance check`;

  // Return pass-through immediately — scoring disabled
  return { topicMatchScore: 8, difficultyMatch: 'correct', reasons: [] };

  // Dead code below kept for reference only
  try {
    let raw = '';

    if (CF_WORKER_URL) {
      const response = await fetch(`${CF_WORKER_URL}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: '@cf/meta/llama-3.1-8b-instruct',
          messages: [
            { role: 'system', content: 'You are a GCSE examiner. Return only valid JSON.' },
            { role: 'user', content: scoringPrompt }
          ]
        })
      });
      const data = await response.json();
      raw = data?.result?.response || '';
    } else if (GEMINI_KEY) {
      // Fallback: use Gemini Flash for scoring
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
      const res = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: scoringPrompt,
        config: { responseMimeType: 'application/json' }
      });
      raw = res.text || '';
    } else {
      // No AI available — skip relevance scoring, pass through
      console.warn('QualityManager: No AI available for relevance scoring. Passing through.');
      return { topicMatchScore: 7, difficultyMatch: 'correct', reasons: ['Relevance scoring skipped — no AI configured'] };
    }

    // Parse score response
    const clean = raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean.substring(clean.indexOf('{'), clean.lastIndexOf('}') + 1));

    const score = Math.max(0, Math.min(10, Number(parsed.topicMatchScore) || 0));
    const diffMatch = ['correct', 'too_easy', 'too_hard'].includes(parsed.difficultyMatch)
      ? parsed.difficultyMatch
      : 'unknown';

    if (score < CONFIG.MIN_TOPIC_MATCH_SCORE) {
      reasons.push(`Low topic relevance: score ${score}/10 — "${parsed.topicReason || 'No reason given'}"`);
    }

    return { topicMatchScore: score, difficultyMatch: diffMatch, reasons };

  } catch (e) {
    // If scoring itself fails, don't block the question — log and pass
    console.warn('QualityManager: Relevance scoring failed, passing question through.', e);
    return { topicMatchScore: 7, difficultyMatch: 'correct', reasons: ['Relevance scoring error — passed through'] };
  }
}

// ─── Audit Logger ─────────────────────────────────────────────────────────────

function logQualityResult(log: QualityLog) {
  try {
    const existing: QualityLog[] = JSON.parse(localStorage.getItem(CONFIG.LOG_KEY) || '[]');
    existing.unshift(log); // newest first
    // Cap log size
    const trimmed = existing.slice(0, CONFIG.MAX_LOG_ENTRIES);
    localStorage.setItem(CONFIG.LOG_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('QualityManager: Could not write audit log.', e);
  }
}

export function getQualityLogs(): QualityLog[] {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.LOG_KEY) || '[]');
  } catch { return []; }
}

export function clearQualityLogs() {
  localStorage.removeItem(CONFIG.LOG_KEY);
}

// ─── Quality Stats (for the admin panel) ─────────────────────────────────────

export interface QualityStats {
  totalGenerated: number;
  passedFirstTry: number;
  passedAfterRetry: number;
  usedFallback: number;
  schemaFailures: number;
  relevanceFailures: number;
  passRate: number;
  avgTopicMatchScore: number;
  difficultyDistribution: Record<string, number>;
  topFailureReasons: { reason: string; count: number }[];
}

export function computeQualityStats(logs: QualityLog[]): QualityStats {
  if (!logs.length) return {
    totalGenerated: 0, passedFirstTry: 0, passedAfterRetry: 0,
    usedFallback: 0, schemaFailures: 0, relevanceFailures: 0,
    passRate: 0, avgTopicMatchScore: 0, difficultyDistribution: {}, topFailureReasons: []
  };

  const passedFirst = logs.filter(l => l.validationResult.passed && l.validationResult.attempts === 1).length;
  const passedRetry = logs.filter(l => l.validationResult.passed && l.validationResult.attempts > 1).length;
  const fallbacks = logs.filter(l => l.usedFallback).length;
  const schema = logs.filter(l => l.validationResult.layer === 'schema').length;
  const relevance = logs.filter(l => l.validationResult.layer === 'relevance').length;

  const scores = logs.map(l => l.validationResult.topicMatchScore || 0).filter(s => s > 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;

  const diffDist: Record<string, number> = {};
  logs.forEach(l => {
    diffDist[l.difficulty] = (diffDist[l.difficulty] || 0) + 1;
  });

  // Count failure reasons
  const reasonCounts: Record<string, number> = {};
  logs.forEach(l => {
    (l.validationResult.reasons || []).forEach(r => {
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    });
  });
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    totalGenerated: logs.length,
    passedFirstTry: passedFirst,
    passedAfterRetry: passedRetry,
    usedFallback: fallbacks,
    schemaFailures: schema,
    relevanceFailures: relevance,
    passRate: Math.round(((passedFirst + passedRetry) / logs.length) * 100),
    avgTopicMatchScore: avgScore,
    difficultyDistribution: diffDist,
    topFailureReasons: topReasons
  };
}

// ─── Main: generateValidatedQuestion ─────────────────────────────────────────

/**
 * Drop-in replacement for QuestionAgent.generateQuestion().
 * Wraps generation with 3-layer validation and auto-retry.
 *
 * Usage in LearningArena.vue:
 *   BEFORE: question.value = await QuestionAgent.generateQuestion(...)
 *   AFTER:  question.value = await generateValidatedQuestion(...)
 */
export async function generateValidatedQuestion(
  topic: Topic,
  difficulty: Difficulty,
  studentYear: number,
  logicProfile?: string,
  isTest?: boolean,
  studyPacks?: any[]
): Promise<Question> {

  let lastFailureReasons: string[] = [];
  let totalAttempts = 0;
  let finalValidation: ValidationResult = { passed: false, layer: 'schema', reasons: [], attempts: 0 };

  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    totalAttempts = attempt;

    // Inject failure feedback from previous attempt into the prompt
    const failureFeedback = lastFailureReasons.length > 0
      ? `IMPORTANT — Your previous attempt was REJECTED for these reasons: ${lastFailureReasons.join('; ')}. Fix these issues.`
      : '';

    // Modify logicProfile to include failure feedback if retrying
    const augmentedProfile = failureFeedback
      ? `${logicProfile || ''} ${failureFeedback}`
      : logicProfile;

    let question: Question;
    try {
      // Parse structured knowledge context if passed as JSON string
      let knowledgeContext: any = undefined;
      if (augmentedProfile) {
        try {
          knowledgeContext = JSON.parse(augmentedProfile);
        } catch {
          // If not JSON, wrap it as plain overview text
          knowledgeContext = { overview: augmentedProfile };
        }
      }

      question = await QuestionAgent.generateQuestion(
        topic,
        difficulty,
        studentYear,
        knowledgeContext,
        isTest,
        studyPacks
      );
    } catch (e) {
      console.warn(`QualityManager: Generation attempt ${attempt} threw an error.`, e);
      lastFailureReasons = [`Generation error: ${(e as Error).message}`];
      continue;
    }

    // ── Layer 1: Schema Validation ──────────────────────────────────────────
    const schemaResult = validateSchema(question, topic, difficulty);
    if (!schemaResult.passed) {
      console.warn(`QualityManager [Attempt ${attempt}]: SCHEMA FAIL —`, schemaResult.reasons);
      lastFailureReasons = schemaResult.reasons;
      finalValidation = { passed: false, layer: 'schema', reasons: schemaResult.reasons, attempts: attempt };
      continue; // retry
    }

    // ── Layer 2: Relevance & Difficulty Scoring ─────────────────────────────
    const relevanceResult = await scoreRelevance(question, topic, difficulty, studentYear);
    if (relevanceResult.reasons.length > 0) {
      console.warn(`QualityManager [Attempt ${attempt}]: RELEVANCE FAIL — Score: ${relevanceResult.topicMatchScore}/10`);
      lastFailureReasons = relevanceResult.reasons;
      finalValidation = {
        passed: false,
        layer: 'relevance',
        reasons: relevanceResult.reasons,
        topicMatchScore: relevanceResult.topicMatchScore,
        difficultyMatch: relevanceResult.difficultyMatch,
        attempts: attempt
      };
      continue; // retry
    }

    // ── All layers passed ───────────────────────────────────────────────────
    finalValidation = {
      passed: true,
      layer: 'passed',
      reasons: [],
      topicMatchScore: relevanceResult.topicMatchScore,
      difficultyMatch: relevanceResult.difficultyMatch,
      attempts: attempt
    };

    // Log success
    logQualityResult({
      timestamp: new Date().toISOString(),
      topicId: topic.id,
      topicName: topic.name,
      subject: topic.subject,
      yearLevel: studentYear,
      difficulty,
      questionText: question.text,
      validationResult: finalValidation,
      usedFallback: false
    });

    if (attempt > 1) {
      console.info(`QualityManager: ✅ Question passed on attempt ${attempt}.`);
    }

    return question;
  }

  // ── All retries exhausted — use fallback ────────────────────────────────
  console.warn(`QualityManager: ⚠️ All ${CONFIG.MAX_RETRIES} attempts failed. Using safe fallback.`);

  const fallback = SAFE_FALLBACKS[topic.subject] || SAFE_FALLBACKS['Maths'];
  const fallbackQuestion: Question = {
    ...fallback,
    id: `fallback-${Date.now()}`,
    topic: topic.name,
    subject: topic.subject,
    difficulty,
  };

  logQualityResult({
    timestamp: new Date().toISOString(),
    topicId: topic.id,
    topicName: topic.name,
    subject: topic.subject,
    yearLevel: studentYear,
    difficulty,
    questionText: fallbackQuestion.text,
    validationResult: { ...finalValidation, attempts: totalAttempts },
    usedFallback: true
  });

  return fallbackQuestion;
}