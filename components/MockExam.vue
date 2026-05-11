<script setup>
/**
 * MockExam.vue
 *
 * CORRECT FLOW:
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 1 — Upload school paper (OPTIONAL, for STYLE only)
 *   What we extract: exam board, question format, marking style, timing ratio,
 *   section structure, difficulty progression. NOT topics. NOT questions.
 *   Purpose: so the generated paper feels identical in format to their school paper.
 *   If skipped: standard GCSE style used as fallback.
 *
 * STEP 2 — Topic picker
 *   Shows ALL built-in curriculum topics for the student's year and subject.
 *   ALSO shows any custom topics the student has added on the Dashboard.
 *   Student ticks: just 1 topic, a few, or all of them.
 *   Student sets total marks + duration (smart defaults auto-fill from paper if uploaded).
 *
 * STEP 3 — Preview & Confirm
 *   Shows what will be generated: each topic, how many marks allocated.
 *
 * STEP 4 — Generate (30–60 seconds)
 *   AI writes questions FOR the selected topics, IN the style of the uploaded paper.
 *
 * STEP 5 — Timed attempt
 * STEP 6 — AI marking
 * STEP 7 — Review (by topic, all answers, action plan)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ref, computed, watch, onUnmounted } from 'vue';
import { CURRICULUM } from '../constants';
import { db } from '../services/dbService';

// ── AI via Flask proxy — key never in frontend ────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const callAI = async (prompt) => {
  const res = await fetch(`${API_BASE}/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || '';
};

const callAIVision = async (prompt, imageData, mimeType) => {
  const res = await fetch(`${API_BASE}/ai/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, imageData, mimeType })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || '';
};


const props = defineProps(['student']);
const emit = defineEmits(['back']);

// phases: home | uploading_maths | uploading_science | topic_select | preview | generating | ready | attempting | marking | review
const phase = ref('home');

// ─────────────────────────────────────────────────────────────────────────────
// PAPER STYLES — stored separately per subject, persisted in localStorage
// Each subject remembers its own uploaded school paper format independently
// ─────────────────────────────────────────────────────────────────────────────

const STYLE_KEY_MATHS   = `edugenius_paper_style_maths_${props.student?.name || 'student'}`;
const STYLE_KEY_SCIENCE = `edugenius_paper_style_science_${props.student?.name || 'student'}`;

// Load saved styles from localStorage (persist between sessions)
const mathsPaperStyle   = ref(JSON.parse(localStorage.getItem(STYLE_KEY_MATHS)   || 'null'));
const sciencePaperStyle = ref(JSON.parse(localStorage.getItem(STYLE_KEY_SCIENCE) || 'null'));

// Save style for a subject
const saveStyleForSubject = (subject, style) => {
  if (subject === 'Maths') {
    mathsPaperStyle.value = style;
    localStorage.setItem(STYLE_KEY_MATHS, JSON.stringify(style));
  } else {
    sciencePaperStyle.value = style;
    localStorage.setItem(STYLE_KEY_SCIENCE, JSON.stringify(style));
  }
};

const clearStyleForSubject = (subject) => {
  if (subject === 'Maths') {
    mathsPaperStyle.value = null;
    localStorage.removeItem(STYLE_KEY_MATHS);
  } else {
    sciencePaperStyle.value = null;
    localStorage.removeItem(STYLE_KEY_SCIENCE);
  }
};

// Which subject's paper we are currently uploading
const uploadingForSubject = ref('Maths');

// Upload state
const fileInput = ref(null);
const uploadedFile = ref(null);
const uploadError = ref('');
const isAnalysing = ref(false);

// Active paper style for the currently selected subject (used in generation)
const paperStyle = computed(() =>
  activeSubject.value === 'Maths' ? mathsPaperStyle.value : sciencePaperStyle.value
);

const handleFileSelect = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  uploadError.value = '';
  if (file.size > 10 * 1024 * 1024) { uploadError.value = 'File too large. Max 10MB.'; return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    uploadedFile.value = {
      base64: ev.target.result.split(',')[1],
      mimeType: file.type || 'image/jpeg',
      name: file.name
    };
  };
  reader.readAsDataURL(file);
};

const startUploadForSubject = (subject) => {
  uploadingForSubject.value = subject;
  uploadedFile.value = null;
  uploadError.value = '';
  phase.value = subject === 'Maths' ? 'uploading_maths' : 'uploading_science';
};

const extractPaperStyle = async () => {
  if (!uploadedFile.value) return;
  isAnalysing.value = true;
  uploadError.value = '';
  try {
    const subjectHint = uploadingForSubject.value === 'Maths'
      ? 'This is a GCSE Maths exam paper.'
      : 'This is a GCSE Science exam paper (Biology, Chemistry, or Physics).';
    const visionPrompt = subjectHint + ` Look at this school exam paper.
Extract ONLY the format, style and structure information — NOT the questions or topics.
Return ONLY valid JSON:
{
  "examBoard": "AQA / Edexcel / OCR / WJEC / Unknown",
  "subject": "Maths or Biology or Chemistry or Physics",
  "questionFormat": "describe layout e.g. numbered questions with lettered sub-parts",
  "markingStyle": "e.g. method marks, 1 mark per correct step",
  "timePerMark": <number, minutes per mark>,
  "totalMarksOnPaper": <integer or null>,
  "durationOnPaper": <integer minutes or null>,
  "sectionStructure": "describe sections e.g. Section A short questions, Section B structured",
  "difficultyProgression": "e.g. easier first or mixed",
  "specialInstructions": "e.g. calculators allowed, show working, significant figures"
}`;
    const raw = await callAIVision(visionPrompt, uploadedFile.value.base64, uploadedFile.value.mimeType);
    const extracted = JSON.parse(raw.replace(/```json|```/g, '').trim());
    // Save to the correct subject slot
    saveStyleForSubject(uploadingForSubject.value, extracted);
    // Go back to home so user can see both styles and then pick topics
    phase.value = 'home';
    uploadedFile.value = null;
  } catch (e) {
    console.error(e);
    uploadError.value = 'Could not read this paper. Try a clearer photo or smaller file.';
  } finally {
    isAnalysing.value = false;
  }
};

const skipUpload = () => {
  uploadedFile.value = null;
  phase.value = 'home';
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — TOPIC PICKER
// ─────────────────────────────────────────────────────────────────────────────

const activeSubject = ref('Maths');

// All built-in topics for this student's year + subject
const builtInTopics = computed(() =>
  CURRICULUM.filter(t => t.year === props.student.yearLevel && t.subject === activeSubject.value)
);

// Custom topics this student has added
const allCustomTopics = ref(
  JSON.parse(localStorage.getItem(`edugenius_custom_topics_${props.student.name}`) || '[]')
);
const customTopicsForSubject = computed(() =>
  allCustomTopics.value.filter(t => t.subject === activeSubject.value)
);

const selectedIds = ref([]);
const isSelected = (id) => selectedIds.value.includes(id);
const toggleTopic = (id) => {
  const i = selectedIds.value.indexOf(id);
  if (i === -1) selectedIds.value.push(id);
  else selectedIds.value.splice(i, 1);
};
const selectAll = () => {
  selectedIds.value = [
    ...builtInTopics.value.map(t => t.id),
    ...customTopicsForSubject.value.map(t => t.id)
  ];
};
const clearAll = () => { selectedIds.value = []; };

// Clear selection when switching subject
watch(activeSubject, () => { selectedIds.value = []; });

// All selected topic objects in order
const selectedTopics = computed(() => {
  const builtIn = builtInTopics.value.filter(t => isSelected(t.id));
  const custom = customTopicsForSubject.value.filter(t => isSelected(t.id));
  return [...builtIn, ...custom];
});

// Marks + time — smart defaults from paper if uploaded, else GCSE standard
const totalMarks = ref(60);
const durationMinutes = ref(60);

// Auto-update defaults when topic count changes
watch(() => selectedIds.value.length, (n) => {
  if (n === 0) return;
  if (paperStyle.value?.totalMarksOnPaper) {
    totalMarks.value = paperStyle.value.totalMarksOnPaper;
    durationMinutes.value = paperStyle.value.durationOnPaper
      || Math.round(paperStyle.value.totalMarksOnPaper * (paperStyle.value.timePerMark || 1.2));
  } else {
    // Standard: ~9 marks per topic, ~1.3 min/mark
    totalMarks.value = Math.min(120, Math.max(20, n * 9));
    durationMinutes.value = Math.round(totalMarks.value * 1.3);
  }
});

const canProceed = computed(() => selectedIds.value.length > 0);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — PREVIEW (mark allocation across topics)
// ─────────────────────────────────────────────────────────────────────────────

// Distribute marks equally, spread remainder across first topics
const marksPerTopic = computed(() => {
  const n = selectedTopics.value.length;
  if (!n) return [];
  const base = Math.floor(totalMarks.value / n);
  const rem = totalMarks.value - base * n;
  return selectedTopics.value.map((t, i) => ({
    ...t,
    allocatedMarks: base + (i < rem ? 1 : 0)
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — GENERATE
// ─────────────────────────────────────────────────────────────────────────────

const isGenerating = ref(false);
const generationProgress = ref('');
const generationError = ref('');
const generatedPaper = ref(null);

const savedPapers = ref(
  JSON.parse(localStorage.getItem(`edugenius_mock_papers_${props.student.name}`) || '[]')
);
const savePapers = () => {
  localStorage.setItem(
    `edugenius_mock_papers_${props.student.name}`,
    JSON.stringify(savedPapers.value.slice(0, 10))
  );
};

const generateMockPaper = async () => {
  if (!canProceed.value) return;
  phase.value = 'generating';
  isGenerating.value = true;
  generationError.value = '';

  try {
    const CF_WORKER_URL = import.meta.env.VITE_CF_WORKER_URL || '';
    const GEMINI_KEY = true; // proxy handles auth
    const yr = props.student.yearLevel;
    const subj = activeSubject.value;

    generationProgress.value = 'Loading topic knowledge from your study hub...';

    // ── IMPROVEMENT 1: Load cached knowledge for each selected topic from DB ──
    // This pulls in curriculum content AND uploaded notes for each topic
    const topicKnowledge = {};
    await Promise.all(
      marksPerTopic.value.map(async (t) => {
        try {
          const [synthesis, curriculum] = await Promise.all([
            db.getTopicSynthesis(props.student.name, t.id).catch(() => null),
            db.getCurriculum(t.id).catch(() => null)
          ]);
          // Prefer notes+curriculum synthesis, fall back to curriculum only
          const knowledge = synthesis || curriculum?.logicProfile || null;
          if (knowledge) {
            topicKnowledge[t.id] = {
              name: t.name,
              overview: knowledge.playbook || knowledge.overview || '',
              formulas: knowledge.keyFormulas || knowledge.keyFormulas || [],
              concepts: knowledge.logicSteps || knowledge.concepts || [],
              mistakes: knowledge.commonMistakes || [],
              hasNotes: !!synthesis
            };
          }
        } catch (e) {
          // If DB unavailable, proceed without knowledge enrichment
        }
      })
    );

    generationProgress.value = 'Preparing exam structure...';

    // ── IMPROVEMENT 2: Subject-specific paper formats ──────────────────────────
    const mathsFormat = paperStyle.value
      ? 'EXAM FORMAT (from uploaded school paper): ' +
        'Exam board: ' + paperStyle.value.examBoard + ' | ' +
        'Layout: ' + paperStyle.value.questionFormat + ' | ' +
        'Marking: ' + paperStyle.value.markingStyle
      : 'MATHS EXAM FORMAT (standard GCSE Maths conventions):' +
        '\n• Numbered questions with lettered sub-parts (a)(b)(c)' +
        '\n• Full working required for ALL questions worth 2+ marks — method marks available' +
        '\n• Mix of: 1-mark recall/state, 2-3 mark method questions, 4-6 mark multi-step problems' +
        '\n• Questions within each topic progress from accessible to challenging' +
        '\n• Final answers should include correct units where applicable' +
        '\n• Approved calculator assumed unless stated otherwise' +
        '\n• Do NOT include any diagrams — describe all shapes/graphs in text';

    const scienceFormat = paperStyle.value
      ? 'EXAM FORMAT (from uploaded school paper): ' +
        'Exam board: ' + paperStyle.value.examBoard + ' | ' +
        'Layout: ' + paperStyle.value.questionFormat + ' | ' +
        'Marking: ' + paperStyle.value.markingStyle
      : 'SCIENCE EXAM FORMAT (standard GCSE Science conventions):' +
        '\n• Mix of question types: State (1 mark), Describe (2-3 marks), Explain (3-4 marks), Calculate (2-4 marks), Evaluate (4-6 marks)' +
        '\n• Command words matter — State requires one word/phrase, Explain requires cause AND effect with linking word' +
        '\n• Calculations must show substitution into formula, then working, then answer with units' +
        '\n• Include recall questions (definitions, facts) AND application questions' +
        '\n• Use correct scientific terminology — mark schemes award marks for key terms' +
        '\n• Describe structure questions: ask students to describe in words (no drawing required)' +
        '\n• Approximately 1.3 minutes per mark';

    const styleBlock = subj === 'Maths' ? mathsFormat : scienceFormat;

    // ── Build enriched topic block using DB knowledge ──────────────────────────
    const topicBlock = marksPerTopic.value.map((t, i) => {
      const knowledge = topicKnowledge[t.id];
      let block = (i + 1) + '. ' + t.name + ' — ' + t.allocatedMarks + ' marks';
      if (t.description) block += ' | ' + t.description;
      if (t.isCustom) block += ' [custom topic]';
      if (knowledge) {
        if (knowledge.hasNotes) block += ' [student has uploaded notes for this topic]';
        if (knowledge.overview) block += '\n   Overview: ' + knowledge.overview.substring(0, 150);
        if (knowledge.formulas.length) block += '\n   Key formulas: ' + knowledge.formulas.slice(0, 3).join(', ');
        if (knowledge.mistakes.length) block += '\n   Test awareness of: ' + knowledge.mistakes.slice(0, 2).join('; ');
      }
      return block;
    }).join('\n');

    generationProgress.value = 'Writing questions (30–60 seconds)...';

    // Subject-specific question emphasis guidance
    const subjectGuidance = subj === 'Maths'
      ? 'MATHS GUIDANCE: Every question must have actual numbers to work with. Use correct mathematical notation. Include a mix of topics if selected. Algebra questions must have specific equations to solve, not just "find x".'
      : 'SCIENCE GUIDANCE: Include a mix of recall (definitions/facts), application (explain why/describe what happens), and calculation questions. Use correct scientific units. Biology/Chemistry/Physics questions have different styles — adapt accordingly.';

    const notesGuidance = Object.values(topicKnowledge).some(k => k.hasNotes)
      ? 'NOTE: Some topics have student-uploaded notes. For those topics, ground questions in the specific formulas and methods shown in the topic knowledge above — not just general GCSE content.'
      : '';

    const prompt = 'You are writing a Year ' + yr + ' ' + subj + ' GCSE mock exam paper.\n\n' +
      styleBlock + '\n\n' +
      subjectGuidance + '\n\n' +
      (notesGuidance ? notesGuidance + '\n\n' : '') +
      'TOPICS TO TEST — write questions ONLY about these topics:\n' +
      topicBlock + '\n\n' +
      'PAPER SETTINGS:\n' +
      '• Total marks: ' + totalMarks.value + ' — questions MUST add up to exactly this number\n' +
      '• Duration: ' + durationMinutes.value + ' minutes\n' +
      '• Year: ' + yr + ' | Subject: ' + subj;

    const promptSuffix = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGRAM STRATEGY — READ CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Many GCSE ${subj} topics involve diagrams in real exams. You MUST handle these
using one of these four strategies. Pick the best one per question.

STRATEGY 1 — TEXT-DESCRIBED SHAPE/DIAGRAM:
Embed all measurements and spatial information in words inside the question text.
✓ "Triangle PQR has a right angle at Q. PQ = 9cm, QR = 12cm. Calculate PR."
✗ "Calculate the missing side in the triangle below."

STRATEGY 2 — DATA TABLE INSTEAD OF GRAPH:
Replace any graph, chart, or distance-time/velocity-time diagram with a data table
embedded in the question text.
✓ "A cyclist records the following data: Time (s): 0, 5, 10, 15 | Speed (m/s): 0, 4, 8, 12. Calculate the acceleration."
✗ "Using the velocity-time graph, find the acceleration."

STRATEGY 3 — DESCRIBE INSTEAD OF DRAW:
When the expected student answer is a drawing or diagram, ask them to describe it in words.
✓ "Describe the structure of an animal cell. Name three organelles and state the function of each." (3 marks)
✗ "Draw and label an animal cell."
Mark scheme: award 1 mark per correctly named organelle with correct function.

STRATEGY 4 — TOPIC SUBSTITUTION:
If a question genuinely cannot work without a specific pre-drawn diagram
(e.g. a particular circuit layout, a given geometric proof figure), generate a
different question on the same topic that is fully self-contained in text.
✓ For Circuits: "A 9V battery is connected in series with two resistors of 3Ω and 6Ω. Calculate the current through the circuit and the voltage across the 6Ω resistor."
✗ "Using the circuit diagram provided, calculate the total resistance."

NEVER write: "see diagram", "as shown", "refer to the figure", "in the image below",
"from the graph above", "using the diagram", "look at the circuit".

INCLUDE real diagram-type questions (geometry, graphs, circuits, force diagrams,
cell structure etc.) but always apply one of the four strategies above.
A good paper should have a MIX: some pure calculation, some describe-instead,
some text-described geometry, some data-table questions.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY this JSON — no markdown fences, no extra text before or after:
{
  "title": "Year ${yr} ${subj} Mock Exam",
  "subject": "${subj}",
  "totalMarks": ${totalMarks.value},
  "durationMinutes": ${durationMinutes.value},
  "examStyle": "${paperStyle.value ? (paperStyle.value.examBoard + ' style (from uploaded paper)') : 'Standard GCSE style'}",
  "instructions": "Answer all questions. Show all working where marks are available for method.",
  "topicsCovered": ${JSON.stringify(marksPerTopic.value.map(t => t.name))},
  "sections": [
    {
      "topic": "exact topic name from the list above",
      "allocatedMarks": <integer>,
      "questions": [
        {
          "id": "q1",
          "number": "1",
          "text": "complete self-contained question text with all values embedded",
          "marks": <integer>,
          "diagramStrategy": "none | text-described | data-table | describe-instead | topic-substitution",
          "modelAnswer": "complete correct answer with full working where applicable",
          "markScheme": ["1 mark for...", "1 mark for..."]
        }
      ]
    }
  ]
}`;

    let raw = '';
    if (CF_WORKER_URL) {
      const r = await fetch(`${CF_WORKER_URL}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: '@cf/meta/llama-3.1-8b-instruct',
          messages: [
            { role: 'system', content: 'You are a GCSE examiner. Return ONLY valid JSON. No markdown. No preamble.' },
            { role: 'user', content: prompt }
          ]
        })
      });
      raw = (await r.json())?.result?.response || '';
    } else if (GEMINI_KEY) {
      raw = await callAI(prompt + promptSuffix);
    } else {
      throw new Error('No AI configured.');
    }
    
    console.log('MockExam AI response length:', raw.length, 'Preview:', raw.substring(0, 100));
    generationProgress.value = 'Finalising paper...';
    
    // Robust JSON extraction
    let data = null;
    const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    
    if (s !== -1 && e > s) {
      try {
        data = JSON.parse(clean.substring(s, e + 1));
      } catch (parseErr) {
        console.error('MockExam JSON parse failed. Raw response:', raw.substring(0, 300));
        throw new Error('AI response could not be parsed. Please try again.');
      }
    } else {
      console.error('MockExam: No JSON found in response. Raw:', raw.substring(0, 300));
      throw new Error('AI did not return a valid paper structure. Please try again.');
    }
    const paper = {
      ...data,
      id: `mock_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      status: 'ready',
      usedSchoolPaperStyle: !!paperStyle.value,
      sections: (data.sections || []).map(sec => ({
        ...sec,
        questions: (sec.questions || []).map(q => ({
          ...q,
          studentAnswer: '',
          awardedMarks: null,
          feedback: '',
          improvement: ''
        }))
      }))
    };

    savedPapers.value.unshift(paper);
    savePapers();
    generatedPaper.value = paper;
    generationProgress.value = '✅ Paper ready!';
    await new Promise(r => setTimeout(r, 500));
    phase.value = 'ready';

  } catch (e) {
    console.error('Generation failed:', e);
    generationError.value = `Could not generate paper: ${e.message}. Please try again.`;
    phase.value = 'preview';
  } finally {
    isGenerating.value = false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PRINT PAPER — generates a printable HTML view, opens browser print dialog
// ─────────────────────────────────────────────────────────────────────────────

const printPaper = (paper) => {
  if (!paper) return;
  
  const questionsHTML = (paper.sections || []).map((sec, si) => `
    <div style="margin-bottom:24px">
      <h3 style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:0.05em;
                 border-bottom:2px solid #1e293b;padding-bottom:6px;margin-bottom:12px;color:#1e293b">
        ${sec.topic || sec.title} — ${sec.allocatedMarks} marks
      </h3>
      ${(sec.questions || []).map((q, qi) => `
        <div style="margin-bottom:20px;page-break-inside:avoid">
          <p style="font-size:12px;font-weight:700;margin-bottom:8px;color:#0f172a;line-height:1.5">
            <strong>${q.number}.</strong> ${q.text}
            <span style="font-size:10px;color:#6366f1;font-weight:900;margin-left:8px">[${q.marks} mark${q.marks > 1 ? 's' : ''}]</span>
          </p>
          ${'<div style="border-bottom:1px solid #cbd5e1;height:28px;margin-bottom:4px"></div>'.repeat(Math.max(2, q.marks + 1))}
        </div>
      `).join('')}
    </div>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${paper.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; max-width: 800px; margin: 0 auto; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="background:#fef3c7;border:1px solid #f59e0b;padding:12px;border-radius:8px;margin-bottom:20px;font-size:12px;font-weight:700;color:#92400e">
    ⚠️ Print this page, then answer by hand. Upload your completed paper photo back to EduGenius to get it AI-marked.
  </div>
  <div style="text-align:center;margin-bottom:24px;border-bottom:3px solid #1e293b;padding-bottom:16px">
    <h1 style="font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:0.05em">${paper.title}</h1>
    <p style="font-size:11px;color:#475569;margin-top:4px;font-weight:600">
      Total: ${paper.totalMarks} marks · Time allowed: ${paper.durationMinutes} minutes · ${paper.examStyle || 'Standard GCSE'}
    </p>
    <p style="font-size:10px;color:#475569;margin-top:2px">${paper.instructions || 'Answer all questions. Show all working.'}</p>
  </div>
  <div style="margin-bottom:16px">
    <p style="font-size:11px;font-weight:700">Name: _________________________________________________ &nbsp;&nbsp; Date: _______________</p>
  </div>
  ${questionsHTML}
  <div style="margin-top:32px;border-top:2px solid #e2e8f0;padding-top:12px;font-size:10px;color:#94a3b8;text-align:center">
    EduGenius AI · Generated ${new Date().toLocaleDateString()} · Upload your completed paper to EduGenius for AI marking
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SCAN-TO-MARK — student uploads photo of handwritten paper, AI reads and marks
// ─────────────────────────────────────────────────────────────────────────────

const scanUploadInput = ref(null);
const isScanningPaper = ref(false);
const scanError = ref('');
const scanningPaper = ref(null); // which paper we are scanning for

const triggerScanUpload = (paper) => {
  scanningPaper.value = paper;
  scanUploadInput.value?.click();
};

const handleScanUpload = async (e) => {
  const file = e.target.files[0];
  if (!file || !scanningPaper.value) return;
  scanError.value = '';
  isScanningPaper.value = true;

  try {
    // Read the image
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // callAIVision handles auth via Flask proxy

    const paper = scanningPaper.value;
    const questionList = (paper.sections || []).flatMap(s =>
      (s.questions || []).map(q => `Q${q.number} (${q.marks} marks): ${q.text}`)
    ).join('\n');

    // Ask Gemini Vision to read handwritten answers from the photo
    const scanPrompt = 'This is a student handwritten answer paper for a GCSE exam.\n' +
      'The questions on the paper are:\n' + questionList + '\n\n' +
      'Read the handwritten answers carefully for each question.\n' +
      'Return ONLY this JSON:\n' +
      '{"answers":{"1":"student answer to q1","2":"student answer to q2"},' +
      '"readingQuality":"clear or mostly clear or difficult to read",' +
      '"notes":"any notes about handwriting quality"}';
    const raw = await callAIVision(scanPrompt, base64, file.type || 'image/jpeg');
    const clean = raw.replace(/\`\`\`json\s*/g, '').replace(/\`\`\`\s*/g, '').trim();
    const s = clean.indexOf('{'), en = clean.lastIndexOf('}');
    const readResult = s !== -1 ? JSON.parse(clean.substring(s, en + 1)) : { answers: {} };

    // Map extracted answers back onto the paper questions
    const paperCopy = JSON.parse(JSON.stringify(paper));
    let qIndex = 1;
    for (const sec of (paperCopy.sections || [])) {
      for (const q of (sec.questions || [])) {
        const answer = readResult.answers?.[q.number] || readResult.answers?.[String(qIndex)] || '';
        q.studentAnswer = answer;
        qIndex++;
      }
    }

    // Now go to marking with the populated answers
    activePaper.value = paperCopy;
    phase.value = 'marking';
    await markAnswers();

  } catch (err) {
    console.error('Scan failed:', err);
    scanError.value = `Could not read the paper: ${err.message}. Make sure the photo is clear and well-lit.`;
  } finally {
    isScanningPaper.value = false;
    scanningPaper.value = null;
    e.target.value = '';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — TIMED ATTEMPT
// ─────────────────────────────────────────────────────────────────────────────

const activePaper = ref(null);
const timeRemaining = ref(0);
const timerInterval = ref(null);

const startExam = (paper) => {
  activePaper.value = JSON.parse(JSON.stringify(paper));
  timeRemaining.value = (paper.durationMinutes || 60) * 60;
  phase.value = 'attempting';
  timerInterval.value = setInterval(() => {
    if (timeRemaining.value > 0) timeRemaining.value--;
    else { clearInterval(timerInterval.value); submitExam(); }
  }, 1000);
};

const submitExam = () => {
  clearInterval(timerInterval.value);
  phase.value = 'marking';
  markAnswers();
};

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
const allQs = computed(() => activePaper.value?.sections?.flatMap(s => s.questions) || []);
const answeredCount = computed(() => allQs.value.filter(q => q.studentAnswer?.trim()).length);
const timerColor = computed(() => {
  const ratio = timeRemaining.value / ((activePaper.value?.durationMinutes || 60) * 60);
  if (ratio > 0.4) return 'text-emerald-600 bg-emerald-50';
  if (ratio > 0.15) return 'text-amber-600 bg-amber-50';
  return 'text-rose-600 bg-rose-50 animate-pulse';
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — MARKING
// ─────────────────────────────────────────────────────────────────────────────

const isMarking = ref(false);
const markingProgress = ref('');
const markedPaper = ref(null);

const markAnswers = async () => {
  isMarking.value = true;
  const paper = activePaper.value;
  const CF = import.meta.env.VITE_CF_WORKER_URL || '';
  const GK = true; // proxy handles auth
  const qs = paper.sections?.flatMap(s => s.questions) || [];

  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    markingProgress.value = `Marking question ${i + 1} of ${qs.length}...`;
    const p = `GCSE examiner marking. Question (${q.marks} marks): ${q.text}
Model answer: ${q.modelAnswer}
Mark scheme: ${(q.markScheme || []).join(' | ')}
Student answer: "${q.studentAnswer?.trim() || '[blank]'}"
Return ONLY JSON: {"awardedMarks":<0-${q.marks}>,"feedback":"one sentence","improvement":"one action"}`;
    try {
      let raw = '';
      if (CF) {
        const r = await fetch(`${CF}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: '@cf/meta/llama-3.1-8b-instruct', messages: [{ role: 'system', content: 'Return only JSON.' }, { role: 'user', content: p }] }) });
        raw = (await r.json())?.result?.response || '';
      } else if (GK) {
        raw = await callAI(p);
      }
      const cl = raw.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cl.substring(cl.indexOf('{'), cl.lastIndexOf('}') + 1));
      q.awardedMarks = Math.max(0, Math.min(q.marks, Number(result.awardedMarks) || 0));
      q.feedback = result.feedback || '';
      q.improvement = result.improvement || '';
    } catch {
      q.awardedMarks = 0;
      q.feedback = 'Could not auto-mark.';
      q.improvement = 'Review this topic in the Learning Arena.';
    }
  }

  const marked = { ...paper, status: 'marked', markedAt: new Date().toISOString() };
  const idx = savedPapers.value.findIndex(p => p.id === paper.id);
  if (idx !== -1) savedPapers.value[idx] = marked;
  savePapers();
  markedPaper.value = marked;
  isMarking.value = false;
  phase.value = 'review';
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — REVIEW
// ─────────────────────────────────────────────────────────────────────────────

const reviewTab = ref('summary');

const totalScore = computed(() => {
  if (!markedPaper.value) return { awarded: 0, total: 0, pct: 0 };
  let a = 0, t = 0;
  markedPaper.value.sections?.forEach(s => s.questions?.forEach(q => { a += q.awardedMarks || 0; t += q.marks || 0; }));
  return { awarded: a, total: t, pct: t ? Math.round(a / t * 100) : 0 };
});

const gradeLabel = computed(() => {
  const p = totalScore.value.pct;
  if (p >= 90) return { label: 'A*', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' };
  if (p >= 80) return { label: 'A',  color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-100' };
  if (p >= 70) return { label: 'B',  color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200' };
  if (p >= 60) return { label: 'C',  color: 'text-indigo-600',  bg: 'bg-indigo-50 border-indigo-200' };
  if (p >= 50) return { label: 'D',  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' };
  return { label: 'U', color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' };
});

const sectionScores = computed(() =>
  markedPaper.value?.sections?.map(s => {
    const aw = s.questions?.reduce((a, q) => a + (q.awardedMarks || 0), 0) || 0;
    const tt = s.questions?.reduce((a, q) => a + (q.marks || 0), 0) || 0;
    return { topic: s.topic || s.title, awarded: aw, total: tt, pct: tt ? Math.round(aw / tt * 100) : 0 };
  }) || []
);

const weakSections = computed(() => sectionScores.value.filter(s => s.pct < 70).sort((a, b) => a.pct - b.pct));
const strongSections = computed(() => sectionScores.value.filter(s => s.pct >= 70).sort((a, b) => b.pct - a.pct));

// Opens a saved paper — show review if marked, start exam if ready
const openPaper = (paper) => {
  if (paper.status === 'marked') {
    markedPaper.value = paper;
    activePaper.value = paper;
    phase.value = 'review';
  } else {
    startExam(paper);
  }
};

onUnmounted(() => { if (timerInterval.value) clearInterval(timerInterval.value); });
</script>

<template>
  <div class="pb-32 space-y-4">
    <!-- Hidden scan input — accessible from all phases -->
    <input ref="scanUploadInput" type="file" accept="image/*,.pdf" class="hidden" @change="handleScanUpload" />

    <!-- ═══ STEP 1: UPLOAD ═══════════════════════════════════════════════════ -->
    <!-- ═══ HOME — Paper style setup + subject select ══════════════════════ -->
    <template v-if="phase === 'home'">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-black text-slate-800">📝 Mock Exam</h2>
          <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Build a paper tailored to your topics</p>
        </div>
        <button @click="emit('back')" class="px-3 py-2 bg-white border-2 border-slate-100 rounded-xl font-black text-[9px] uppercase tracking-widest">← Back</button>
      </div>

      <!-- Past papers -->
      <div v-if="savedPapers.length" class="space-y-2">
        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Previous Papers</p>
        <div v-for="paper in savedPapers" :key="paper.id" class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-black text-slate-800 truncate">{{ paper.title }}</p>
            <div class="flex flex-wrap items-center gap-2 mt-0.5">
              <span class="text-[8px] font-bold text-slate-400">{{ paper.totalMarks }} marks · {{ paper.durationMinutes }}min</span>
              <span :class="['text-[7px] font-black px-1.5 py-0.5 rounded-full', paper.status === 'marked' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600']">
                {{ paper.status === 'marked' ? '✓ Marked' : '▶ Ready' }}
              </span>
            </div>
            <div class="flex flex-wrap gap-1 mt-1">
              <span v-for="t in (paper.topicsCovered || []).slice(0, 3)" :key="t" class="text-[7px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-full">{{ t }}</span>
            </div>
          </div>
          <div class="flex flex-col gap-1 flex-shrink-0">
            <button @click="openPaper(paper)" class="px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-black text-[8px] uppercase tracking-widest">{{ paper.status === 'marked' ? 'Review' : 'Start' }}</button>
            <button v-if="paper.status !== 'marked'" @click="printPaper(paper)" class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl font-black text-[8px] uppercase tracking-widest">🖨️ Print</button>
            <button v-if="paper.status !== 'marked'" @click="triggerScanUpload(paper)" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl font-black text-[8px] uppercase tracking-widest">📷 Scan</button>
          </div>
        </div>
      </div>

      <!-- Paper format cards — separate per subject -->
      <div class="space-y-3">
        <div>
          <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">School Paper Formats</p>
          <p class="text-[8px] text-slate-400 font-bold">Upload your school's exam papers once — each subject remembers its own format.</p>
        </div>
        <!-- Maths -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-lg">🔢</span>
              <div>
                <p class="text-[11px] font-black text-white">Maths Paper Format</p>
                <p class="text-[8px] text-white/60 font-bold">{{ mathsPaperStyle ? mathsPaperStyle.examBoard + ' · ' + (mathsPaperStyle.durationOnPaper || '?') + 'min' : 'Not uploaded' }}</p>
              </div>
            </div>
            <span :class="['text-[7px] font-black px-2 py-0.5 rounded-full', mathsPaperStyle ? 'bg-emerald-400 text-white' : 'bg-white/20 text-white']">
              {{ mathsPaperStyle ? '✓ Loaded' : 'Optional' }}
            </span>
          </div>
          <div class="p-4">
            <div v-if="mathsPaperStyle" class="mb-3 space-y-1">
              <p class="text-[9px] font-bold text-slate-700">{{ mathsPaperStyle.questionFormat }}</p>
              <p class="text-[8px] text-slate-400 font-bold">{{ mathsPaperStyle.markingStyle }}</p>
              <p v-if="mathsPaperStyle.specialInstructions" class="text-[8px] text-indigo-500 font-bold">📌 {{ mathsPaperStyle.specialInstructions }}</p>
            </div>
            <div v-else class="mb-3 bg-slate-50 rounded-xl p-3">
              <p class="text-[9px] font-bold text-slate-400">Standard format used — numbered questions, show working, method marks.</p>
            </div>
            <div class="flex gap-2">
              <button @click="startUploadForSubject('Maths')" class="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700">
                {{ mathsPaperStyle ? '↑ Replace' : '+ Upload Maths Paper' }}
              </button>
              <button v-if="mathsPaperStyle" @click="clearStyleForSubject('Maths')" class="px-3 py-2 bg-rose-50 text-rose-500 rounded-xl font-black text-[9px]">✕</button>
            </div>
          </div>
        </div>
        <!-- Science -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-lg">🧪</span>
              <div>
                <p class="text-[11px] font-black text-white">Science Paper Format</p>
                <p class="text-[8px] text-white/60 font-bold">{{ sciencePaperStyle ? (sciencePaperStyle.subject || 'Science') + ' · ' + sciencePaperStyle.examBoard + ' · ' + (sciencePaperStyle.durationOnPaper || '?') + 'min' : 'Not uploaded' }}</p>
              </div>
            </div>
            <span :class="['text-[7px] font-black px-2 py-0.5 rounded-full', sciencePaperStyle ? 'bg-emerald-400 text-white' : 'bg-white/20 text-white']">
              {{ sciencePaperStyle ? '✓ Loaded' : 'Optional' }}
            </span>
          </div>
          <div class="p-4">
            <div v-if="sciencePaperStyle" class="mb-3 space-y-1">
              <p class="text-[9px] font-bold text-slate-700">{{ sciencePaperStyle.questionFormat }}</p>
              <p class="text-[8px] text-slate-400 font-bold">{{ sciencePaperStyle.markingStyle }}</p>
              <p v-if="sciencePaperStyle.specialInstructions" class="text-[8px] text-emerald-600 font-bold">📌 {{ sciencePaperStyle.specialInstructions }}</p>
            </div>
            <div v-else class="mb-3 bg-slate-50 rounded-xl p-3">
              <p class="text-[9px] font-bold text-slate-400">Standard format — State/Describe/Explain/Calculate questions, command words, scientific units.</p>
            </div>
            <div class="flex gap-2">
              <button @click="startUploadForSubject('Science')" class="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700">
                {{ sciencePaperStyle ? '↑ Replace' : '+ Upload Science Paper' }}
              </button>
              <button v-if="sciencePaperStyle" @click="clearStyleForSubject('Science')" class="px-3 py-2 bg-rose-50 text-rose-500 rounded-xl font-black text-[9px]">✕</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Build paper buttons -->
      <div class="grid grid-cols-2 gap-3">
        <button @click="activeSubject = 'Maths'; selectedIds = []; phase = 'topic_select'"
          class="py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg">
          🔢 Maths Paper
        </button>
        <button @click="activeSubject = 'Science'; selectedIds = []; phase = 'topic_select'"
          class="py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg">
          🧪 Science Paper
        </button>
      </div>
    </template>

    <!-- ═══ UPLOAD for specific subject ══════════════════════════════════════ -->
    <template v-else-if="phase === 'uploading_maths' || phase === 'uploading_science'">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-black text-slate-800">{{ uploadingForSubject === 'Maths' ? '🔢 Maths' : '🧪 Science' }} Format</h2>
          <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">We read format and style only</p>
        </div>
        <button @click="phase = 'home'" class="px-3 py-2 bg-white border-2 border-slate-100 rounded-xl font-black text-[9px] uppercase tracking-widest">← Back</button>
      </div>
      <div class="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-1">
            <p class="text-[8px] font-black text-emerald-600 uppercase tracking-widest">✅ Extracted</p>
            <p class="text-[9px] font-bold text-emerald-700">Exam board</p>
            <p class="text-[9px] font-bold text-emerald-700">Question format</p>
            <p class="text-[9px] font-bold text-emerald-700">Marking style</p>
            <p class="text-[9px] font-bold text-emerald-700">Timing · sections</p>
          </div>
          <div class="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-1">
            <p class="text-[8px] font-black text-rose-500 uppercase tracking-widest">❌ Ignored</p>
            <p class="text-[9px] font-bold text-rose-600">Questions</p>
            <p class="text-[9px] font-bold text-rose-600">Answers</p>
            <p class="text-[9px] font-bold text-rose-600">Topics on paper</p>
          </div>
        </div>
        <div @click="fileInput.click()" class="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center cursor-pointer hover:border-indigo-400 transition-all">
          <p class="text-2xl mb-2">{{ uploadedFile ? '📎' : '📄' }}</p>
          <p class="text-[10px] font-black text-slate-600">{{ uploadedFile ? uploadedFile.name : 'Upload ' + uploadingForSubject + ' paper' }}</p>
          <p class="text-[8px] text-slate-400 font-bold mt-1">Photo or PDF · Max 10MB</p>
        </div>
        <input ref="fileInput" type="file" accept="image/*,.pdf" class="hidden" @change="handleFileSelect" />
        <p v-if="uploadError" class="text-[9px] font-bold text-rose-500">{{ uploadError }}</p>
        <div class="flex gap-3">
          <button @click="extractPaperStyle" :disabled="!uploadedFile || isAnalysing"
            :class="['flex-1 py-3 text-white rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-40 transition-all', uploadingForSubject === 'Maths' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700']">
            {{ isAnalysing ? '⏳ Reading...' : 'Save ' + uploadingForSubject + ' Style →' }}
          </button>
          <button @click="skipUpload" class="px-4 py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
        </div>
      </div>
    </template>

    <template v-else-if="phase === 'topic_select'">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-black text-slate-800">{{ activeSubject === 'Maths' ? '🔢' : '🧪' }} {{ activeSubject }} Topics</h2>
          <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Year {{ student.yearLevel }} · {{ selectedIds.length }} selected</p>
        </div>
        <button @click="phase = 'home'" class="px-3 py-2 bg-white border-2 border-slate-100 rounded-xl font-black text-[9px] uppercase tracking-widest">← Back</button>
      </div>

      <!-- Per-subject style badge — shows format for THIS subject -->
      <div :class="['rounded-2xl p-3 flex items-center justify-between gap-3 border',
        paperStyle ? (activeSubject === 'Maths' ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100') : 'bg-slate-50 border-slate-200']">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="text-xl flex-shrink-0">{{ paperStyle ? '📄' : '📋' }}</span>
          <div class="min-w-0">
            <p class="text-[10px] font-black truncate" :class="paperStyle ? (activeSubject === 'Maths' ? 'text-indigo-700' : 'text-emerald-700') : 'text-slate-600'">
              {{ paperStyle ? paperStyle.examBoard + ' ' + activeSubject + ' format' : 'Standard GCSE ' + activeSubject + ' format' }}
            </p>
            <p class="text-[8px] font-bold text-slate-400 truncate">
              {{ paperStyle ? (paperStyle.durationOnPaper ? paperStyle.durationOnPaper + 'min · ' : '') + paperStyle.questionFormat : 'No school paper uploaded for ' + activeSubject }}
            </p>
          </div>
        </div>
        <button @click="startUploadForSubject(activeSubject)"
          class="text-[8px] font-black px-2 py-1 rounded-lg flex-shrink-0"
          :class="paperStyle ? 'bg-slate-200 text-slate-600' : 'bg-indigo-100 text-indigo-600'">
          {{ paperStyle ? 'Change' : '+ Upload' }}
        </button>
      </div>

      <!-- Select/clear row -->
      <div class="flex items-center justify-between">
        <p class="text-[9px] font-bold text-slate-400">{{ builtInTopics.length + customTopicsForSubject.length }} topics for Year {{ student.yearLevel }} {{ activeSubject }}</p>
        <div class="flex gap-2">
          <button @click="selectAll" class="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[8px] uppercase tracking-widest">Select All</button>
          <button @click="clearAll" class="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-xl font-black text-[8px] uppercase tracking-widest">Clear</button>
        </div>
      </div>

      <!-- Built-in topics -->
      <div class="space-y-2">
        <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Curriculum Topics</p>
        <div v-for="topic in builtInTopics" :key="topic.id" @click="toggleTopic(topic.id)"
          :class="['flex items-center gap-3 bg-white rounded-2xl p-4 border-2 cursor-pointer transition-all active:scale-[0.98]',
            isSelected(topic.id) ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-100 hover:border-slate-200']">
          <!-- Checkbox -->
          <div :class="['w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all',
            isSelected(topic.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white']">
            <span v-if="isSelected(topic.id)" class="text-white text-[10px] font-black leading-none">✓</span>
          </div>
          <!-- Topic info -->
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-black text-slate-800 leading-tight">{{ topic.name }}</p>
            <p class="text-[8px] text-slate-400 font-medium mt-0.5 truncate">{{ topic.description }}</p>
          </div>
          <!-- Mastery indicator -->
          <div class="flex-shrink-0 text-right">
            <span v-if="student.masteryData?.[topic.id]?.status === 'completed'" class="text-[9px]">⭐</span>
            <span v-else-if="student.masteryData?.[topic.id]?.score > 0"
              class="text-[8px] font-black text-amber-500">{{ student.masteryData[topic.id].score }}%</span>
            <span v-else class="text-[8px] text-slate-200 font-bold">—</span>
          </div>
        </div>
      </div>

      <!-- Custom topics -->
      <div v-if="customTopicsForSubject.length" class="space-y-2">
        <p class="text-[8px] font-black text-violet-500 uppercase tracking-widest">Your Custom Topics</p>
        <div v-for="topic in customTopicsForSubject" :key="topic.id" @click="toggleTopic(topic.id)"
          :class="['flex items-center gap-3 bg-white rounded-2xl p-4 border-2 cursor-pointer transition-all active:scale-[0.98]',
            isSelected(topic.id) ? 'border-violet-500 bg-violet-50/60' : 'border-violet-100 hover:border-violet-200']">
          <div :class="['w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0',
            isSelected(topic.id) ? 'bg-violet-600 border-violet-600' : 'border-violet-300 bg-white']">
            <span v-if="isSelected(topic.id)" class="text-white text-[10px] font-black leading-none">✓</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <p class="text-[11px] font-black text-slate-800">{{ topic.name }}</p>
              <span class="text-[6px] bg-violet-100 text-violet-600 font-black px-1 py-0.5 rounded-full uppercase">Custom</span>
            </div>
            <p class="text-[8px] text-slate-400 font-medium mt-0.5 truncate">{{ topic.description }}</p>
          </div>
        </div>
      </div>

      <!-- Marks + time controls (shown only when topics selected) -->
      <div v-if="selectedIds.length > 0" class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Paper Settings</p>
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Marks</label>
            <input v-model.number="totalMarks" type="number" min="10" max="200"
              class="w-full py-2.5 px-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-slate-800 text-sm focus:outline-none focus:border-indigo-400 transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Duration (mins)</label>
            <input v-model.number="durationMinutes" type="number" min="10" max="180"
              class="w-full py-2.5 px-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-slate-800 text-sm focus:outline-none focus:border-indigo-400 transition-colors" />
          </div>
        </div>
        <!-- Live mark allocation preview -->
        <div>
          <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Mark allocation</p>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            <div v-for="t in marksPerTopic" :key="t.id" class="flex items-center justify-between text-[9px] py-0.5">
              <span class="font-bold text-slate-600 truncate flex-1 mr-3">{{ t.name }}</span>
              <span class="font-black text-indigo-600 flex-shrink-0">{{ t.allocatedMarks }} mark{{ t.allocatedMarks !== 1 ? 's' : '' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!canProceed" class="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
        <p class="text-[10px] font-bold text-amber-700">Select at least one topic to continue</p>
      </div>

      <button @click="phase = 'preview'" :disabled="!canProceed"
        class="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-40 shadow-lg">
        Review Paper ({{ selectedIds.length }} topic{{ selectedIds.length !== 1 ? 's' : '' }}) →
      </button>
    </template>

    <!-- ═══ PREVIEW ═════════════════════════════════════════════════════════ -->
    <template v-else-if="phase === 'preview'">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-black text-slate-800">Confirm Paper</h2>
        <button @click="phase = 'topic_select'" class="px-3 py-2 bg-white border-2 border-slate-100 rounded-xl font-black text-[9px] uppercase tracking-widest">← Edit</button>
      </div>

      <div class="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-5">
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="bg-indigo-50 rounded-2xl p-4">
            <p class="text-2xl font-black text-indigo-700">{{ totalMarks }}</p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Marks</p>
          </div>
          <div class="bg-indigo-50 rounded-2xl p-4">
            <p class="text-2xl font-black text-indigo-700">{{ durationMinutes }}<span class="text-sm">m</span></p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Time</p>
          </div>
          <div class="bg-indigo-50 rounded-2xl p-4">
            <p class="text-2xl font-black text-indigo-700">{{ selectedIds.length }}</p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Topics</p>
          </div>
        </div>

        <!-- Topic breakdown -->
        <div>
          <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Topics & marks</p>
          <div class="space-y-1.5 max-h-64 overflow-y-auto">
            <div v-for="t in marksPerTopic" :key="t.id" class="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
              <span class="text-sm flex-shrink-0">{{ t.isCustom ? '✨' : activeSubject === 'Maths' ? '🔢' : '🧪' }}</span>
              <div class="flex-1 min-w-0">
                <p class="text-[10px] font-black text-slate-800 truncate">{{ t.name }}</p>
                <p class="text-[8px] text-slate-400 font-medium truncate">{{ t.description }}</p>
              </div>
              <span class="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full flex-shrink-0">
                {{ t.allocatedMarks }} mark{{ t.allocatedMarks !== 1 ? 's' : '' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Style summary -->
        <div class="bg-slate-50 rounded-2xl p-3">
          <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Exam format</p>
          <p class="text-[10px] font-bold text-slate-700">
            {{ paperStyle
              ? `${paperStyle.examBoard} · ${paperStyle.questionFormat}`
              : 'Standard GCSE · Numbered questions, show working required' }}
          </p>
        </div>

        <p v-if="generationError" class="text-[9px] font-bold text-rose-500 bg-rose-50 rounded-xl p-3">{{ generationError }}</p>
      </div>

      <button @click="generateMockPaper"
        class="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:opacity-90 transition-all shadow-lg">
        Generate Mock Paper 🚀
      </button>
    </template>

    <!-- ═══ GENERATING ═══════════════════════════════════════════════════════ -->
    <template v-else-if="phase === 'generating'">
      <div class="bg-white rounded-3xl p-12 text-center space-y-6 border border-slate-100 shadow-sm">
        <div class="relative mx-auto w-20 h-20">
          <div class="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
          <div class="absolute inset-0 border-4 border-t-indigo-600 rounded-full animate-spin"></div>
          <span class="absolute inset-0 flex items-center justify-center text-2xl">📝</span>
        </div>
        <div>
          <h3 class="text-base font-black text-slate-800">Building Your Mock Paper</h3>
          <p class="text-[10px] text-slate-500 font-bold mt-1">{{ generationProgress }}</p>
        </div>
        <div class="bg-slate-50 rounded-2xl p-4 text-left">
          <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Writing questions for:</p>
          <div class="space-y-1">
            <div v-for="t in marksPerTopic" :key="t.id" class="flex justify-between text-[9px]">
              <span class="font-bold text-slate-600">{{ t.name }}</span>
              <span class="font-black text-indigo-500">{{ t.allocatedMarks }}m</span>
            </div>
          </div>
        </div>
        <p class="text-[9px] text-slate-400 font-bold">Takes 30–60 seconds. Do not close this screen.</p>
      </div>
    </template>

    <!-- ═══ READY ════════════════════════════════════════════════════════════ -->
    <template v-else-if="phase === 'ready'">
      <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-8 text-white text-center space-y-3">
        <div class="text-5xl">✅</div>
        <h2 class="text-xl font-black">Your Mock Paper is Ready!</h2>
        <div class="flex justify-center gap-6">
          <div class="text-center"><p class="text-2xl font-black">{{ generatedPaper?.totalMarks }}</p><p class="text-[8px] uppercase opacity-70 tracking-widest">marks</p></div>
          <div class="text-center"><p class="text-2xl font-black">{{ generatedPaper?.durationMinutes }}m</p><p class="text-[8px] uppercase opacity-70 tracking-widest">timed</p></div>
          <div class="text-center"><p class="text-2xl font-black">{{ generatedPaper?.topicsCovered?.length }}</p><p class="text-[8px] uppercase opacity-70 tracking-widest">topics</p></div>
        </div>
        <div class="flex flex-wrap justify-center gap-1.5 pt-1">
          <span v-for="t in (generatedPaper?.topicsCovered || [])" :key="t" class="text-[8px] bg-white/20 text-white font-bold px-2 py-1 rounded-full">{{ t }}</span>
        </div>
      </div>
      <!-- Two ways to attempt -->
      <div class="grid grid-cols-1 gap-3">
        <!-- Option A: Digital attempt (timed, on-screen) -->
        <div class="bg-slate-900 rounded-2xl p-4 space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-lg">💻</span>
            <div>
              <p class="text-[11px] font-black text-white">Attempt on Screen</p>
              <p class="text-[8px] text-slate-400 font-bold">Timed · AI marks instantly when you submit</p>
            </div>
          </div>
          <div class="bg-amber-900/30 border border-amber-700/30 rounded-xl p-2">
            <p class="text-[8px] font-bold text-amber-300">⚠️ Timer starts immediately. Find a quiet spot first.</p>
          </div>
          <button @click="startExam(generatedPaper)"
            class="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-indigo-700 transition-all">
            Start Timed Exam ▶
          </button>
        </div>

        <!-- Option B: Print and hand-write -->
        <div class="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-lg">🖨️</span>
            <div>
              <p class="text-[11px] font-black text-slate-800">Print & Write by Hand</p>
              <p class="text-[8px] text-slate-500 font-bold">Print the paper → answer on paper → upload photo for AI marking</p>
            </div>
          </div>
          <div class="space-y-2">
            <button @click="printPaper(generatedPaper)"
              class="w-full py-2.5 bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all">
              🖨️ Print Question Paper
            </button>
            <div class="relative">
              <button @click="triggerScanUpload(generatedPaper)" :disabled="isScanningPaper"
                class="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50">
                {{ isScanningPaper ? '📖 Reading handwriting...' : '📷 Upload Completed Paper' }}
              </button>
            </div>
            <p v-if="scanError" class="text-[8px] font-bold text-rose-500">{{ scanError }}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3 space-y-1">
            <p class="text-[8px] font-black text-slate-500 uppercase tracking-widest">How it works</p>
            <p class="text-[8px] text-slate-500 font-bold">1. Print the paper · 2. Answer by hand · 3. Take a clear photo · 4. Upload — AI reads your handwriting and marks each question</p>
          </div>
        </div>
      </div>

      <button @click="phase = 'topic_select'" class="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500">
        Change Topics & Regenerate
      </button>
    </template>

    <!-- ═══ ATTEMPTING ═══════════════════════════════════════════════════════ -->
    <template v-else-if="phase === 'attempting'">
      <div class="sticky top-0 z-50 bg-white border-b border-slate-100 -mx-4 px-4 py-3 flex items-center justify-between shadow-sm">
        <div>
          <p class="text-[9px] font-black text-slate-600 uppercase tracking-widest">{{ activePaper?.subject }} Mock</p>
          <p class="text-[8px] text-slate-400 font-bold">{{ answeredCount }}/{{ allQs.length }} answered</p>
        </div>
        <div class="flex items-center gap-2">
          <div :class="['px-3 py-1.5 rounded-xl font-black text-sm tabular-nums', timerColor]">⏱ {{ fmt(timeRemaining) }}</div>
          <button @click="submitExam" class="px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest">Submit</button>
        </div>
      </div>
      <div class="space-y-6 pt-2">
        <div v-for="section in activePaper?.sections" :key="section.topic" class="space-y-3">
          <div class="bg-slate-800 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div>
              <h3 class="text-[10px] font-black text-white">{{ section.topic }}</h3>
              <p class="text-[8px] text-slate-400 font-bold">{{ section.allocatedMarks }} marks</p>
            </div>
            <span class="text-[8px] bg-white/10 text-white/60 font-bold px-2 py-0.5 rounded-full">{{ section.questions?.length }}Q</span>
          </div>
          <div v-for="q in section.questions" :key="q.id" class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-3">
            <div class="flex items-start gap-2">
              <span class="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">{{ q.number }}</span>
              <div class="flex-1">
                <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <p class="text-[8px] text-indigo-400 font-black">[{{ q.marks }} mark{{ q.marks > 1 ? 's' : '' }}]</p>
                  <!-- Diagram strategy badge — explains why question is text-based -->
                  <span v-if="q.diagramStrategy && q.diagramStrategy !== 'none'" class="text-[7px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1">
                    <span>{{ q.diagramStrategy === 'text-described' ? '📐 Shape described in text'
                           : q.diagramStrategy === 'data-table' ? '📊 Data given as table'
                           : q.diagramStrategy === 'describe-instead' ? '✍️ Describe your answer'
                           : q.diagramStrategy === 'topic-substitution' ? '🔄 Text equivalent'
                           : '' }}</span>
                  </span>
                </div>
                <p class="text-sm font-bold text-slate-800 leading-relaxed">{{ q.text }}</p>
              </div>
            </div>
            <textarea v-model="q.studentAnswer" :rows="Math.max(2, Math.min(6, q.marks + 1))"
              :placeholder="q.diagramStrategy === 'describe-instead' ? `Describe in words... (${q.marks} mark${q.marks > 1 ? 's' : ''})` : `Answer here (${q.marks} mark${q.marks > 1 ? 's' : ''})`"
              class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-400 transition-colors resize-none">
            </textarea>
          </div>
        </div>
      </div>
      <button @click="submitExam" class="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg">
        Submit — {{ answeredCount }}/{{ allQs.length }} answered
      </button>
    </template>

    <!-- ═══ MARKING ══════════════════════════════════════════════════════════ -->
    <template v-else-if="phase === 'marking'">
      <div class="bg-white rounded-3xl p-12 text-center space-y-6 border border-slate-100 shadow-sm">
        <div class="relative mx-auto w-20 h-20">
          <div class="absolute inset-0 border-4 border-amber-100 rounded-full"></div>
          <div class="absolute inset-0 border-4 border-t-amber-500 rounded-full animate-spin"></div>
          <span class="absolute inset-0 flex items-center justify-center text-2xl">✏️</span>
        </div>
        <div>
          <h3 class="text-base font-black text-slate-800">Marking Your Paper</h3>
          <p class="text-[10px] text-slate-500 font-bold mt-1">{{ markingProgress }}</p>
        </div>
        <p class="text-[9px] text-slate-400 font-bold">Checking each answer against the mark scheme — 1–3 minutes.</p>
      </div>
    </template>

    <!-- ═══ REVIEW ═══════════════════════════════════════════════════════════ -->
    <template v-else-if="phase === 'review'">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-black text-slate-800">Results 📊</h2>
        <button @click="phase = 'upload'" class="px-3 py-2 bg-white border-2 border-slate-100 rounded-xl font-black text-[9px] uppercase tracking-widest">New Paper</button>
      </div>

      <!-- Grade card -->
      <div class="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-3xl p-8 text-white text-center space-y-3">
        <p class="text-[9px] font-black uppercase tracking-widest text-indigo-400">{{ markedPaper?.title }}</p>
        <div class="flex items-center justify-center gap-5">
          <div :class="['w-24 h-24 rounded-[2rem] flex items-center justify-center text-4xl font-black border-2', gradeLabel.bg, gradeLabel.color]">
            {{ gradeLabel.label }}
          </div>
          <div class="text-left">
            <p class="text-4xl font-black">{{ totalScore.awarded }}<span class="text-xl text-white/40">/{{ totalScore.total }}</span></p>
            <p class="text-[10px] text-white/50 font-bold">{{ totalScore.pct }}%</p>
          </div>
        </div>
        <div class="flex flex-wrap justify-center gap-1.5 pt-1">
          <span v-for="t in (markedPaper?.topicsCovered || [])" :key="t" class="text-[7px] bg-white/10 text-white/60 font-bold px-2 py-0.5 rounded-full">{{ t }}</span>
        </div>
        <p v-if="markedPaper?.usedSchoolPaperStyle" class="text-[8px] text-indigo-400 font-bold">📄 Generated in your school's exam style</p>
      </div>

      <!-- Tabs -->
      <div class="bg-slate-100 p-1 rounded-2xl flex gap-1">
        <button v-for="t in [['summary','📊 By Topic'],['questions','📋 Answers'],['plan','🎯 Action Plan']]" :key="t[0]"
          @click="reviewTab = t[0]"
          :class="['flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all', reviewTab === t[0] ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400']">
          {{ t[1] }}
        </button>
      </div>

      <!-- By topic summary -->
      <template v-if="reviewTab === 'summary'">
        <div class="space-y-2">
          <div v-for="s in sectionScores" :key="s.topic" class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div class="flex items-center justify-between mb-2">
              <p class="text-[11px] font-black text-slate-800">{{ s.topic }}</p>
              <span class="text-[10px] font-black" :class="s.pct >= 70 ? 'text-emerald-600' : s.pct >= 50 ? 'text-amber-500' : 'text-rose-500'">
                {{ s.awarded }}/{{ s.total }} ({{ s.pct }}%)
              </span>
            </div>
            <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-700"
                :class="s.pct >= 70 ? 'bg-emerald-400' : s.pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'"
                :style="{ width: s.pct + '%' }"></div>
            </div>
          </div>
        </div>
      </template>

      <!-- All answers with model answers + feedback -->
      <template v-else-if="reviewTab === 'questions'">
        <div class="space-y-3">
          <div v-for="section in markedPaper?.sections" :key="section.topic">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 mt-3">{{ section.topic }}</p>
            <div class="space-y-2">
              <div v-for="q in section.questions" :key="q.id" class="bg-white rounded-2xl p-4 border-2 shadow-sm"
                :class="q.awardedMarks === q.marks ? 'border-emerald-100' : q.awardedMarks === 0 ? 'border-rose-100' : 'border-amber-100'">
                <div class="flex items-start justify-between gap-2 mb-2">
                  <p class="text-[11px] font-black text-slate-700 flex-1 leading-snug">{{ q.number }}. {{ q.text }}</p>
                  <span class="font-black text-sm flex-shrink-0" :class="q.awardedMarks === q.marks ? 'text-emerald-600' : q.awardedMarks === 0 ? 'text-rose-500' : 'text-amber-500'">
                    {{ q.awardedMarks }}/{{ q.marks }}
                  </span>
                </div>
                <div class="space-y-1.5 text-[10px]">
                  <div class="bg-slate-50 rounded-xl p-2.5">
                    <p class="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Your answer</p>
                    <p class="font-medium text-slate-600">{{ q.studentAnswer || 'No answer given' }}</p>
                  </div>
                  <div class="bg-emerald-50 rounded-xl p-2.5">
                    <p class="text-[7px] font-black text-emerald-600 uppercase tracking-widest mb-1">Model answer</p>
                    <p class="font-medium text-slate-700">{{ q.modelAnswer }}</p>
                  </div>
                  <div v-if="q.feedback" class="bg-indigo-50 rounded-xl p-2.5">
                    <p class="text-[7px] font-black text-indigo-500 uppercase tracking-widest mb-1">Examiner feedback</p>
                    <p class="font-medium text-slate-700">{{ q.feedback }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Action plan by topic -->
      <template v-else-if="reviewTab === 'plan'">
        <div class="space-y-3">
          <div v-if="weakSections.length" class="bg-slate-900 rounded-3xl p-5 text-white space-y-3">
            <h3 class="text-sm font-black text-rose-400">Topics to Revisit</h3>
            <div v-for="(s, i) in weakSections" :key="s.topic" class="bg-white/5 rounded-2xl p-4">
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <span class="w-5 h-5 bg-rose-500 rounded-lg flex items-center justify-center text-[8px] font-black">{{ i + 1 }}</span>
                  <p class="text-[11px] font-black">{{ s.topic }}</p>
                </div>
                <span class="text-[9px] font-black text-rose-400">{{ s.pct }}%</span>
              </div>
              <p class="text-[9px] text-slate-400 font-bold pl-7">→ Go to Learning Arena · Practice · Mastery Test</p>
            </div>
          </div>

          <div v-if="strongSections.length" class="bg-emerald-50 border border-emerald-100 rounded-3xl p-5">
            <h3 class="text-sm font-black text-emerald-700 mb-2">Strong Topics ✅</h3>
            <div v-for="s in strongSections" :key="s.topic" class="flex items-center justify-between py-0.5">
              <p class="text-[10px] font-bold text-emerald-700">{{ s.topic }}</p>
              <span class="text-[9px] font-black text-emerald-600">{{ s.pct }}%</span>
            </div>
          </div>

          <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
            <p class="text-[10px] font-black text-indigo-700 mb-1">Next Step</p>
            <p class="text-[9px] font-bold text-indigo-600">
              {{ totalScore.pct >= 70
                ? 'Strong result. Focus on the weaker topics, then try a full mock with all topics selected.'
                : totalScore.pct >= 50
                  ? 'Good foundation. Work through the weak topics in the Learning Arena, then re-attempt this mock.'
                  : 'Focus on one topic at a time in the Learning Arena before attempting another mock.' }}
            </p>
          </div>
        </div>
      </template>
    </template>

  </div>
</template>