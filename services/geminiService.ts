import { Question, AssessmentResult, Difficulty, Topic, PaperAnalysis, StudyPack } from '../types';

// ─── Core API calls — all routed through Flask proxy ─────────────────────────
// Key is stored securely on the server, never in the frontend bundle.

const API_BASE = (import.meta as any).env.VITE_API_URL || 'http://localhost:5000/api';

const parseJSON = (text: string, fallback: any) => {
  if (!text) return fallback;
  try {
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(clean);
  } catch {
    try {
      const s = text.indexOf('{'), e = text.lastIndexOf('}');
      if (s !== -1 && e > s) return JSON.parse(text.substring(s, e + 1));
    } catch {}
    console.warn('EduGenius: JSON parse failed. Raw:', text.substring(0, 200));
    return fallback;
  }
};

// Text prompt → Flask → Gemini → text response
const ask = async (prompt: string): Promise<string> => {
  const res = await fetch(`${API_BASE}/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || '';
};

// Text prompt with system instruction → Flask → Gemini
const askWithSystem = async (prompt: string, system: string): Promise<string> => {
  const res = await fetch(`${API_BASE}/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || '';
};

// Vision: image + prompt → Flask → Gemini Vision
const askVision = async (prompt: string, imageData: string, mimeType: string): Promise<string> => {
  const res = await fetch(`${API_BASE}/ai/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, imageData, mimeType })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || '';
};

const prepareBase64 = (base64: string, fallbackMime: string) => {
  const parts = base64.split(';base64,');
  if (parts.length === 2) return { data: parts[1], mimeType: parts[0].split(':')[1] || fallbackMime };
  return { data: base64, mimeType: fallbackMime };
};

// ─── Agents ───────────────────────────────────────────────────────────────────

export const Agents = {

  Socrates: {
    hintForQuestion: async (
      userQuery: string,
      question: { text: string; hint?: string; explanation?: string },
      briefingContext: { overview: string; formulas: string[]; steps: string[]; mistakes: string[] },
      yearLevel: number
    ): Promise<string> => {
      try {
        const context = [
          `EXAM QUESTION the student is working on: "${question.text}"`,
          question.hint ? `Hint available: ${question.hint}` : '',
          briefingContext.formulas.length ? `Relevant formulas: ${briefingContext.formulas.join(', ')}` : '',
          briefingContext.steps.length ? `Key method steps: ${briefingContext.steps.slice(0, 3).join('; ')}` : '',
          briefingContext.mistakes.length ? `Common mistakes to avoid: ${briefingContext.mistakes.slice(0, 2).join('; ')}` : ''
        ].filter(Boolean).join('\n');

        const system = `You are Socrates tutoring a Year ${yearLevel} GCSE student.
The student is stuck on a specific exam question. Your ONLY job is to guide them toward the answer without giving it.
STRICT RULES:
1. NEVER state the answer or give the final calculation result
2. Ask ONE guiding question that points them in the right direction
3. You may reference the formulas or method steps if relevant
4. Be specific to their question — no generic advice
5. Max 50 words. Encouraging tone.`;

        return await askWithSystem(`Context:\n${context}\n\nStudent asks: "${userQuery}"`, system);
      } catch {
        return 'Think about what formula applies here. What information does the question give you?';
      }
    },

    explainTopic: async (
      userQuery: string,
      briefingContext: { topicName: string; overview: string; formulas: string[]; steps: string[]; flashcards: Array<{front: string; back: string}>; mistakes: string[] },
      yearLevel: number
    ): Promise<string> => {
      try {
        const context = [
          `TOPIC: ${briefingContext.topicName}`,
          `Overview: ${briefingContext.overview}`,
          briefingContext.formulas.length ? `Key formulas: ${briefingContext.formulas.join(' | ')}` : '',
          briefingContext.steps.length ? `Method steps: ${briefingContext.steps.join('; ')}` : '',
          briefingContext.flashcards.length ? `Key concepts: ${briefingContext.flashcards.slice(0, 3).map(f => `${f.front} → ${f.back}`).join(' | ')}` : '',
          briefingContext.mistakes.length ? `Common mistakes: ${briefingContext.mistakes.join('; ')}` : ''
        ].filter(Boolean).join('\n');

        const system = `You are a GCSE tutor helping a Year ${yearLevel} student understand a topic concept.
The student has a CONCEPTUAL DOUBT — they are not asking for help with an exam question.
RULES:
1. Explain concepts CLEARLY — you CAN give full explanations and definitions
2. Use simple language appropriate for Year ${yearLevel}
3. Reference the specific formulas and steps from the topic context if relevant
4. Give a worked example if it helps understanding
5. Keep response under 80 words. Be clear and encouraging.`;

        return await askWithSystem(`Topic context:\n${context}\n\nStudent asks: "${userQuery}"`, system);
      } catch {
        return 'Great question! Let me break this down simply. Which part specifically are you finding tricky?';
      }
    }
  },

  Tutor: {
    generateExplanation: async (topic: Topic, yearLevel: number, studyPacks: StudyPack[] = []) => {
      const fallback = {
        overview: `${topic.name}: ${topic.description || 'A key GCSE topic for Year ' + yearLevel + '.'}`,
        concepts: ['Core definition', 'Key steps', 'Exam application', 'Common traps'],
        explanation: topic.description || `Study ${topic.name} carefully.`,
        proTip: 'Always show your working — method marks count even if your final answer is wrong.',
        flashcards: [
          { front: `What is ${topic.name}?`, back: topic.description || 'A fundamental GCSE concept.' },
          { front: `When do you use ${topic.name}?`, back: 'In exam questions that test this concept.' }
        ],
        keyFormulas: [],
        commonMistakes: ['Not showing all working steps', 'Missing units in the final answer']
      };

      try {
        const notesContext = studyPacks?.length > 0
          ? `Also incorporate these specific student notes: ${JSON.stringify(studyPacks.map(s => ({ playbook: s.playbook, logicSteps: s.logicSteps, keyFormulas: s.keyFormulas })))}`
          : '';

        const raw = await ask(`You are a GCSE ${topic.subject} tutor. Explain "${topic.name}" for Year ${yearLevel} GCSE students.
Use standard UK GCSE ${topic.subject} curriculum as your foundation.
${notesContext}

Return ONLY this JSON (no other text):
{
  "overview": "2-3 clear sentences explaining what this topic is and why it matters in GCSE",
  "concepts": ["specific concept or step 1", "specific concept or step 2", "specific concept or step 3", "specific concept or step 4"],
  "explanation": "clear paragraph with a worked example showing exactly how to apply this topic",
  "proTip": "one specific exam technique tip that helps students score marks in ${topic.name} questions",
  "flashcards": [
    {"front": "specific question testing ${topic.name}", "back": "specific correct answer"},
    {"front": "another specific question", "back": "specific answer"},
    {"front": "exam-style question", "back": "model answer"}
  ],
  "keyFormulas": ["exact formula 1 with variable definitions", "exact formula 2"],
  "commonMistakes": ["specific mistake students make in ${topic.name} questions", "another specific mistake"]
}`);

        const result = parseJSON(raw, null);
        if (!result?.overview || result.concepts?.[0] === 'Core definition' || result.overview.length < 50) {
          console.warn('EduGenius Tutor: generic response for', topic.name);
          return fallback;
        }
        return result;
      } catch (e: any) {
        console.error('EduGenius Tutor.generateExplanation error:', e?.message);
        return fallback;
      }
    }
  },

  Briefing: {
    processSource: async (base64Data: string, mimeType: string): Promise<StudyPack> => {
      const fallback = { playbook: '', proceduralDNA: '', logicSteps: [], flashcards: [], commonMistakes: [], keyFormulas: [] };
      try {
        const { data, mimeType: mt } = prepareBase64(base64Data, mimeType);
        const raw = await askVision(`Analyze this study document carefully and extract all key learning content.
Return this JSON exactly:
{
  "playbook": "main concept or method described in the document in 2-3 sentences",
  "proceduralDNA": "step by step procedure if any",
  "logicSteps": ["specific step 1", "specific step 2", "specific step 3"],
  "flashcards": [{"front": "specific question from this content", "back": "specific answer from this content"}],
  "commonMistakes": ["specific mistake mentioned or implied in this material"],
  "keyFormulas": ["exact formula or rule found in this document"]
}`, data, mt);
        return parseJSON(raw, fallback);
      } catch (e: any) {
        console.error('EduGenius Briefing error:', e?.message);
        return fallback;
      }
    }
  },

  NotebookLM: {
    synthesizeHub: async (
      studyPacks: StudyPack[],
      topicName?: string,
      yearLevel?: number,
      curriculumContent?: { overview: string; concepts: string[]; keyFormulas: string[]; commonMistakes: string[]; explanation: string }
    ) => {
      try {
        const curriculumBlock = curriculumContent
          ? `CURRICULUM FOUNDATION (always include this as the base):
Overview: ${curriculumContent.overview}
Key concepts: ${curriculumContent.concepts.join('; ')}
Formulas: ${curriculumContent.keyFormulas.join(', ') || 'None specified'}
Common mistakes: ${curriculumContent.commonMistakes.join('; ')}
Explanation: ${curriculumContent.explanation}`
          : `Use standard GCSE Year ${yearLevel} curriculum for "${topicName}" as the foundation.`;

        const notesBlock = studyPacks?.length > 0
          ? `STUDENT NOTES (enrich the curriculum with these):
${JSON.stringify(studyPacks.map(s => ({ playbook: s.playbook, logicSteps: s.logicSteps, keyFormulas: s.keyFormulas, flashcards: s.flashcards })))}`
          : 'No student notes uploaded — use curriculum only.';

        const raw = await ask(`You are synthesizing study material for "${topicName}" (Year ${yearLevel} GCSE).

${curriculumBlock}

${notesBlock}

INSTRUCTIONS:
- The curriculum provides the foundational, exam-accurate content
- The student notes add their teacher's specific examples, phrasing, and emphasis
- Merge both: keep curriculum accuracy, add notes-specific detail

Return ONLY this JSON:
{
  "playbook": "combined overview: curriculum foundation + any additional context from notes",
  "logicSteps": ["specific step 1", "specific step 2", "specific step 3", "specific step 4"],
  "flashcards": [
    {"front": "key question from curriculum", "back": "answer"},
    {"front": "question from student notes if available", "back": "answer"},
    {"front": "exam application question", "back": "answer"}
  ],
  "keyFormulas": ["formula 1", "formula 2"],
  "commonMistakes": ["specific mistake 1", "specific mistake 2"],
  "cheatSheet": "one paragraph combining the key points from both curriculum and notes"
}`);

        return parseJSON(raw, {});
      } catch (e: any) {
        console.error('EduGenius NotebookLM error:', e?.message);
        return {};
      }
    }
  }
};

// ─── Vision Agent ─────────────────────────────────────────────────────────────

export const VisionAgent = {
  analyzePaper: async (base64Data: string, mimeType: string): Promise<PaperAnalysis> => {
    const fallback = { topics: [], difficulty: 'Intermediate', summary: 'Standard exam format', subject: 'Maths' as any };
    try {
      const { data, mimeType: mt } = prepareBase64(base64Data, mimeType);
      const raw = await askVision(`Analyze this exam paper. Return JSON:
{
  "topics": ["topic 1", "topic 2"],
  "difficulty": "Beginner or Intermediate or Advanced",
  "summary": "one sentence summary of paper style",
  "questionStyle": "description of question format"
}`, data, mt);
      return parseJSON(raw, fallback);
    } catch (e: any) {
      console.error('EduGenius VisionAgent error:', e?.message);
      return fallback;
    }
  }
};

// ─── Question Agent ───────────────────────────────────────────────────────────

export const QuestionAgent = {
  generateQuestion: async (
    topic: Topic,
    difficulty: Difficulty,
    studentYear: number,
    knowledgeContext?: {
      overview?: string;
      formulas?: string[];
      concepts?: string[];
      commonMistakes?: string[];
      explanation?: string;
      recentQuestions?: string[];
    },
    isTest?: boolean,
    studyPacks?: StudyPack[]
  ): Promise<Question> => {

    const fallback: Question = {
      id: Math.random().toString(36).substr(2, 9),
      subject: topic.subject, topic: topic.name, difficulty, isExamStyle: isTest,
      text: `A right-angled triangle has two shorter sides of 3 cm and 4 cm. Calculate the hypotenuse.`,
      options: ['5 cm', '7 cm', '6 cm', '4.5 cm'],
      correctAnswer: '5 cm',
      explanation: 'Using Pythagoras: a² + b² = c² → 9 + 16 = 25 → √25 = 5 cm.',
      hint: 'Use a² + b² = c² where c is the hypotenuse.'
    };

    try {
      const ctx = knowledgeContext || {};
      const knowledgeBlock = [
        ctx.overview ? `Topic overview: ${ctx.overview}` : '',
        ctx.concepts?.length ? `Key concepts: ${ctx.concepts.join('; ')}` : '',
        ctx.formulas?.length ? `Key formulas (use these in your question): ${ctx.formulas.join(' | ')}` : '',
        ctx.commonMistakes?.length ? `Common mistakes (test awareness of these): ${ctx.commonMistakes.join('; ')}` : '',
        ctx.explanation ? `Detailed explanation for reference: ${ctx.explanation}` : ''
      ].filter(Boolean).join('\n');

      const avoidBlock = ctx.recentQuestions?.length
        ? `\nAVOID repeating these recent questions:\n${ctx.recentQuestions.slice(0, 5).map((q, i) => `${i + 1}. ${q}`).join('\n')}`
        : '';

      const notesStyle = studyPacks?.length
        ? `\nMatch question style from student notes: ${studyPacks.map(s => s.proceduralDNA).filter(Boolean).join('; ')}`
        : '';

      const raw = await ask(`Write a ${difficulty} GCSE ${topic.subject} question on "${topic.name}" for Year ${studentYear}.

KNOWLEDGE BASE FOR THIS QUESTION:
${knowledgeBlock}
${avoidBlock}
${notesStyle}

${isTest
  ? 'FORMAL MASTERY TEST: Make this rigorous, exam-standard. Require multi-step working. No hints in the question text.'
  : 'PRACTICE QUESTION: Clear and educational. Include all values needed. Good for building understanding.'}

DIAGRAM RULES (no images available):
- Geometry: describe shapes in words e.g. "Triangle ABC has AB=6cm, angle B=90°, BC=8cm"
- Graphs: give data as a table e.g. "Time(s): 0,2,4,6 | Speed(m/s): 0,5,10,15"
- Never say "see diagram", "from the graph", "as shown"

Return ONLY this JSON:
{
  "text": "complete self-contained question with all values",
  "options": ["option A", "option B", "option C", "option D"],
  "correctAnswer": "must match one option exactly",
  "explanation": "step by step working showing why this is correct",
  "hint": "specific clue about which method or formula to use"
}
For open-ended: options:[] and correctAnswer:"full model answer with working".`);

      const data = parseJSON(raw, null);
      if (!data?.text || data.text.length < 15) {
        console.warn('EduGenius QuestionAgent: weak response for', topic.name);
        return fallback;
      }
      if (data.options?.length > 0 && !data.options.includes(data.correctAnswer)) {
        data.correctAnswer = data.options[0];
      }
      return {
        id: Math.random().toString(36).substr(2, 9),
        subject: topic.subject, topic: topic.name, difficulty, isExamStyle: isTest,
        ...data
      };
    } catch (e: any) {
      console.error('EduGenius QuestionAgent error:', e?.message);
      return fallback;
    }
  }
};

// ─── Assessment Agent ─────────────────────────────────────────────────────────

export const AssessmentAgent = {
  assess: async (question: Question, studentAnswer: string, yearLevel: number): Promise<AssessmentResult> => {
    const isSimpleMatch = question.options?.includes(studentAnswer)
      ? studentAnswer === question.correctAnswer
      : studentAnswer.toLowerCase().includes(question.correctAnswer.toLowerCase().substring(0, 20));

    const fallback: AssessmentResult = {
      isCorrect: isSimpleMatch,
      score: isSimpleMatch ? 85 : 20,
      feedback: isSimpleMatch ? 'Correct! Well done.' : `Not quite. The correct answer is: ${question.correctAnswer}`,
      affirmation: isSimpleMatch ? '🎉 Excellent work!' : '💪 Good try — review and try again!',
      correctiveHint: isSimpleMatch ? '' : (question.hint || 'Review the method and try again.'),
      newDifficulty: isSimpleMatch ? Difficulty.INTERMEDIATE : Difficulty.BEGINNER,
      analysis: ''
    };

    try {
      const raw = await ask(`GCSE marker for Year ${yearLevel} students.

Question: ${question.text}
Correct answer: ${question.correctAnswer}
Student answered: "${studentAnswer}"

Mark this and return JSON:
{
  "isCorrect": true or false,
  "score": 0-100,
  "feedback": "one specific sentence about what was right or wrong in their answer",
  "affirmation": "short encouraging message",
  "correctiveHint": "one specific improvement tip if wrong, empty string if correct",
  "newDifficulty": "Beginner or Intermediate or Advanced",
  "analysis": "brief note on student understanding"
}`);

      const result = parseJSON(raw, fallback);
      if (!['Beginner', 'Intermediate', 'Advanced'].includes(result.newDifficulty)) {
        result.newDifficulty = Difficulty.BEGINNER;
      }
      return result;
    } catch (e: any) {
      console.error('EduGenius AssessmentAgent error:', e?.message);
      return fallback;
    }
  }
};

// ─── Legacy compat ─────────────────────────────────────────────────────────────
export const VideoAgent = {
  generateTourVideo: async (_?: (msg: string) => void): Promise<string> => {
    throw new Error('Video generation requires a paid Gemini account.');
  }
};
export const setCompatibilityMode = (_: boolean) => {};