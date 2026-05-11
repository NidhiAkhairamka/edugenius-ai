<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { AssessmentAgent, Agents } from '../services/geminiService';
import { generateValidatedQuestion } from '../services/questionManager';
import { AdaptiveDifficultyEngine } from '../services/adaptiveDifficulty';
import { Difficulty } from '../types';
import { db } from '../services/dbService';

const props = defineProps(['topic', 'student']);
const emit = defineEmits(['complete', 'exit', 'updateProgress']);

// ── Phase ─────────────────────────────────────────────────────────────────────
const phase = ref('briefing');
const briefingTab = ref('Concept');

// Minimum practice % before Test tab is accessible
const MIN_PRACTICE_FOR_TEST = 50;
const canAccessTest = computed(() => practiceProgress.value >= MIN_PRACTICE_FOR_TEST);

// ── Question state ─────────────────────────────────────────────────────────────
const question = ref(null);
const userAnswer = ref('');
const assessment = ref(null);
const loading = ref(true);
const checking = ref(false);
const error = ref(null);
const practiceProgress = ref(0);
const difficulty = ref(Difficulty.BEGINNER);
const difficultyEngine = ref(null);

// ── Question history (prevents repetition) ────────────────────────────────────
// Stores the last N question texts for this topic so AI avoids repeating them
const recentQuestions = ref([]);
const MAX_HISTORY = 8;

const addToHistory = (questionText) => {
  recentQuestions.value.unshift(questionText);
  if (recentQuestions.value.length > MAX_HISTORY) {
    recentQuestions.value = recentQuestions.value.slice(0, MAX_HISTORY);
  }
};

// ── Socrates — TWO separate modes ─────────────────────────────────────────────
// Mode 1: Topic explanation (in Briefing tab) — free explanation, can define concepts
// Mode 2: Question hint (in Practice/Test) — strict Socratic, never gives answer

const showTopicSocrates = ref(false);   // Briefing tab — "Ask about this topic"
const showHintSocrates = ref(false);    // Practice/Test — "Need a hint?"

const topicSocratesQuery = ref('');
const hintSocratesQuery = ref('');
const isTopicSocratesThinking = ref(false);
const isHintSocratesThinking = ref(false);
const topicChatHistory = ref([]);
const hintChatHistory = ref([]);

// ── Knowledge hub ──────────────────────────────────────────────────────────────
const notebookHubData = ref(null);    // merged notes + curriculum synthesis
const curriculumData = ref(null);     // raw curriculum from AI/DB
const isSynthesizingHub = ref(false);
const isHubSynced = ref(false);

// ── Notes upload ──────────────────────────────────────────────────────────────
const uploadedNotes = ref([]);
const isProcessingNote = ref(false);
const noteUploadError = ref('');
const noteFileInput = ref(null);

const briefingVault = computed(() => props.student.currentBriefingVault || []);
const briefingCount = computed(() => briefingVault.value.length + uploadedNotes.value.length);

// ── Active content — prefers merged hub, falls back to curriculum ──────────────
// curriculumData from DB has shape { logicProfile: {...} } — always use getLogicProfile()
const activeCurriculum = computed(() => getLogicProfile(curriculumData.value));

const activePlaybook = computed(() =>
  notebookHubData.value?.playbook ||
  activeCurriculum.value?.overview ||
  'Loading study content...'
);
const activeLogicSteps = computed(() =>
  notebookHubData.value?.logicSteps ||
  activeCurriculum.value?.concepts || []
);
const activeFlashcards = computed(() =>
  notebookHubData.value?.flashcards ||
  activeCurriculum.value?.flashcards || []
);
const activeFormulas = computed(() =>
  notebookHubData.value?.keyFormulas ||
  activeCurriculum.value?.keyFormulas || []
);
const activeMistakes = computed(() =>
  notebookHubData.value?.commonMistakes ||
  activeCurriculum.value?.commonMistakes || []
);
const activeProTip = computed(() =>
  activeCurriculum.value?.proTip || 'Focus on exact exam board keywords.'
);
const activeExplanation = computed(() =>
  activeCurriculum.value?.explanation || ''
);

// ── Full knowledge context for question generation & Socrates ──────────────────
// This is the single source of truth fed into all downstream AI calls
const fullKnowledgeContext = computed(() => ({
  overview: activePlaybook.value,
  formulas: activeFormulas.value,
  concepts: activeLogicSteps.value,
  commonMistakes: activeMistakes.value,
  explanation: activeExplanation.value,
  recentQuestions: recentQuestions.value
}));

// Full context for Socrates (topic explanation mode)
const socratesBriefingContext = computed(() => ({
  topicName: props.topic.name,
  overview: activePlaybook.value,
  formulas: activeFormulas.value,
  steps: activeLogicSteps.value,
  flashcards: activeFlashcards.value,
  mistakes: activeMistakes.value
}));

// Full context for Socrates (question hint mode)
const socratesQuestionContext = computed(() => ({
  overview: activePlaybook.value,
  formulas: activeFormulas.value,
  steps: activeLogicSteps.value,
  mistakes: activeMistakes.value
}));

const revealedCards = ref(new Set());
const toggleCard = (idx) => {
  if (revealedCards.value.has(idx)) revealedCards.value.delete(idx);
  else revealedCards.value.add(idx);
};


// ── Phase watcher ──────────────────────────────────────────────────────────────
watch(phase, (newPhase) => {
  if ((newPhase === 'practice' || newPhase === 'test') && !question.value && !loading.value) {
    fetchQuestion(newPhase === 'test');
  }
});

// ── Load ───────────────────────────────────────────────────────────────────────
const loadState = () => {
  const mastery = props.student.masteryData?.[props.topic.id];
  if (mastery) {
    practiceProgress.value = mastery.score || 0;
    if (mastery.difficulty) difficulty.value = mastery.difficulty;
  }
  difficultyEngine.value = new AdaptiveDifficultyEngine(
    props.topic.id,
    props.student.name,
    difficulty.value
  );
};

const isRealAIContent = (analysis) => {
  if (!analysis) return false;
  // Handle both direct analysis object and nested logicProfile structure
  const obj = analysis.logicProfile || analysis;
  if (!obj.overview) return false;
  // Must be longer than just the topic description (real AI content is detailed)
  if (obj.overview.length < 50) return false;
  // Generic fallback labels mean AI call failed
  if (obj.concepts?.[0] === 'Core definition') return false;
  return true;
};

// Extract the actual logicProfile from whatever structure is passed
const getLogicProfile = (data) => {
  if (!data) return null;
  return data.logicProfile || data;
};

// ── IMPROVEMENT 1: Generate curriculum and immediately feed into synthesis ─────
const generateAndSyncCurriculum = async () => {
  isSynthesizingHub.value = true;
  try {
    // Step 1: Get AI curriculum content
    const analysis = await Agents.Tutor.generateExplanation(props.topic, props.student.yearLevel);
    const payload = {
      topicId: props.topic.id,
      subject: props.topic.subject,
      yearLevel: props.student.yearLevel,
      logicProfile: analysis,
      commonQuestions: analysis.concepts || []
    };
    curriculumData.value = payload;

    // Save to DB only if real content
    if (isRealAIContent(analysis)) {
      db.saveCurriculum(payload).catch(e => console.warn('DB curriculum save failed:', e));
    }

    // Step 2: If student has notes, combine them with curriculum immediately
    const allPacks = [
      ...briefingVault.value.map(v => v.studyPack).filter(Boolean),
      ...uploadedNotes.value.map(v => v.studyPack).filter(Boolean)
    ];

    if (allPacks.length > 0) {
      // Merge notes + curriculum into unified hub
      const hub = await Agents.NotebookLM.synthesizeHub(
        allPacks,
        props.topic.name,
        props.student.yearLevel,
        isRealAIContent(analysis) ? analysis : null
      );
      notebookHubData.value = hub;
      await db.saveTopicSynthesis(props.student.name, props.topic.id, hub).catch(() => {});
      isHubSynced.value = true;
    }
  } catch (e) {
    console.error('generateAndSyncCurriculum failed:', e);
    // Emergency fallback
    curriculumData.value = {
      topicId: props.topic.id,
      subject: props.topic.subject,
      yearLevel: props.student.yearLevel,
      logicProfile: {
        overview: `${props.topic.name}: ${props.topic.description || ''}`,
        concepts: ['Check internet connection'],
        explanation: props.topic.description || '',
        proTip: '',
        flashcards: [],
        keyFormulas: [],
        commonMistakes: []
      },
      commonQuestions: []
    };
  } finally {
    isSynthesizingHub.value = false;
  }
};

// ── IMPROVEMENT 2: Re-synthesise when notes are added — always combine both ────
const resynthesizeWithNotes = async () => {
  isSynthesizingHub.value = true;
  try {
    const allPacks = [
      ...briefingVault.value.map(v => v.studyPack).filter(Boolean),
      ...uploadedNotes.value.map(v => v.studyPack).filter(Boolean)
    ];
    // Pass curriculum as context so they get merged, not replaced
    const curriculum = getLogicProfile(curriculumData.value);
    const hub = await Agents.NotebookLM.synthesizeHub(
      allPacks,
      props.topic.name,
      props.student.yearLevel,
      isRealAIContent(curriculum) ? curriculum : null
    );
    notebookHubData.value = hub;
    await db.saveTopicSynthesis(props.student.name, props.topic.id, hub).catch(() => {});
    isHubSynced.value = true;
  } catch (e) {
    console.error('resynthesizeWithNotes failed:', e);
  } finally {
    isSynthesizingHub.value = false;
  }
};

const loadSynthesis = async () => {
  loading.value = true;
  try {
    loadState();

    // STEP 1: Load static curriculum first — one network call
    let staticCurriculum = null;
    try {
      staticCurriculum = await db.getStaticCurriculum(props.topic.id);
    } catch(e) { staticCurriculum = null; }

    if (staticCurriculum) {
      // Show content immediately — stop spinner now
      curriculumData.value = {
        topicId: props.topic.id,
        subject: props.topic.subject,
        yearLevel: props.student.yearLevel,
        logicProfile: staticCurriculum,
        commonQuestions: staticCurriculum.concepts || []
      };
      loading.value = false; // ← Content visible NOW, no more waiting

      // STEP 2: Load notes hub in background — doesn't block UI
      db.getTopicSynthesis(props.student.name, props.topic.id)
        .then(cachedHub => {
          if (cachedHub) {
            notebookHubData.value = cachedHub;
            isHubSynced.value = true;
          } else if (briefingCount.value > 0) {
            resynthesizeWithNotes();
          }
        }).catch(() => {});
      return;
    }

    // STEP 3: No static content — try DB cache then AI (sequential fallback)
    const [cachedHub, cachedCurriculum] = await Promise.all([
      db.getTopicSynthesis(props.student.name, props.topic.id).catch(() => null),
      db.getCurriculum(props.topic.id).catch(() => null)
    ]);

    if (cachedHub) {
      notebookHubData.value = cachedHub;
      isHubSynced.value = true;
    }

    const hasRealCurriculum = cachedCurriculum &&
      isRealAIContent(getLogicProfile(cachedCurriculum));

    if (hasRealCurriculum) {
      curriculumData.value = cachedCurriculum;
      if (!cachedHub && briefingCount.value > 0) {
        await resynthesizeWithNotes();
      }
    } else {
      await generateAndSyncCurriculum();
    }
  } catch (e) {
    console.error('loadSynthesis error:', e);
  } finally {
    loading.value = false;
  }
};

// ── Notes upload ──────────────────────────────────────────────────────────────
const triggerNoteUpload = () => noteFileInput.value?.click();

const handleNoteFile = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  noteUploadError.value = '';
  if (file.size > 10 * 1024 * 1024) { noteUploadError.value = 'File too large. Max 10MB.'; return; }

  isProcessingNote.value = true;
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const base64String = base64.split(',')[1];
    const mimeType = file.type || 'image/jpeg';
    const studyPack = await Agents.Briefing.processSource(base64String, mimeType);

    const entry = {
      id: `briefing_${Date.now()}`,
      fileName: file.name,
      date: new Date().toISOString(),
      studyPack,
      topicId: props.topic.id,
      studentName: props.student.name
    };

    await db.saveBriefing(props.student.name, props.topic.id, entry);
    uploadedNotes.value.push(entry);

    // Re-synthesise — always combines notes + curriculum together
    await resynthesizeWithNotes();
    e.target.value = '';
  } catch (err) {
    console.error('Note upload failed:', err);
    noteUploadError.value = 'Could not process this file. Try a clearer photo or smaller PDF.';
  } finally {
    isProcessingNote.value = false;
  }
};

const deleteNote = async (entryId) => {
  await db.deleteBriefing(entryId);
  uploadedNotes.value = uploadedNotes.value.filter(n => n.id !== entryId);
  if (briefingCount.value > 0) {
    await resynthesizeWithNotes();
  } else {
    notebookHubData.value = null;
    isHubSynced.value = false;
  }
};

// ── IMPROVEMENT 3: Question generation with full structured knowledge ──────────
const fetchQuestion = async (isTest = false) => {
  loading.value = true;
  assessment.value = null;
  userAnswer.value = '';
  error.value = null;
  try {
    const context = difficultyEngine.value?.getDifficultyContext();
    const allPacks = [
      ...briefingVault.value.map(v => v.studyPack).filter(Boolean),
      ...uploadedNotes.value.map(v => v.studyPack).filter(Boolean)
    ];

    // Build full structured knowledge context — NOT just a brief string
    const knowledgeContext = {
      ...fullKnowledgeContext.value,
      // Add performance context from adaptive engine
      overview: context?.performanceSummary
        ? `${fullKnowledgeContext.value.overview} [Student context: ${context.performanceSummary}]`
        : fullKnowledgeContext.value.overview
    };

    // Try static question bank first — instant, no API call
    const sessionUsedIds = recentQuestions.value
      .map(q => q.id).filter(Boolean);

    const staticQ = !isTest // test mode always uses live AI for rigor
      ? await db.getStaticQuestion(
          props.topic.id,
          context?.difficulty || difficulty.value,
          props.student.yearLevel,
          sessionUsedIds
        ).catch(() => null)
      : null;

    if (staticQ) {
      // Got a question from the bank — instant, no API call
      question.value = {
        id: staticQ.id,
        subject: props.topic.subject,
        topic: props.topic.name,
        difficulty: context?.difficulty || difficulty.value,
        isExamStyle: isTest,
        text: staticQ.text,
        options: staticQ.options || [],
        correctAnswer: staticQ.correctAnswer,
        explanation: staticQ.explanation,
        hint: staticQ.hint || ''
      };
    } else {
      // Bank exhausted or test mode — fall back to live AI generation
      question.value = await generateValidatedQuestion(
        props.topic,
        context?.difficulty || difficulty.value,
        props.student.yearLevel,
        JSON.stringify(knowledgeContext),
        isTest,
        allPacks.length > 0 ? allPacks : undefined
      );
    }

    // Track this question to avoid repetition
    if (question.value?.text) {
      addToHistory(question.value.text);
    }
  } catch (e) {
    error.value = 'Could not generate question. Tap retry.';
  } finally {
    loading.value = false;
  }
};

// ── Answer submission ──────────────────────────────────────────────────────────
const submitAnswer = async () => {
  if (!userAnswer.value || checking.value || !question.value) return;
  assessment.value = {
    isCorrect: false, affirmation: 'Checking...', feedback: 'Reviewing your answer.',
    score: 0, newDifficulty: difficulty.value, analysis: ''
  };
  checking.value = true;
  try {
    const res = await AssessmentAgent.assess(question.value, userAnswer.value, props.student.yearLevel);
    assessment.value = res;
    if (phase.value !== 'test') {
      if (res.isCorrect) practiceProgress.value = Math.min(100, practiceProgress.value + 25);
      difficulty.value = difficultyEngine.value
        ? difficultyEngine.value.recordAnswer(res.isCorrect, difficulty.value)
        : res.newDifficulty;
      emit('updateProgress', props.topic.id, practiceProgress.value, difficulty.value);
    }
  } finally {
    checking.value = false;
  }
};

// ── IMPROVEMENT 4: Split Socrates ──────────────────────────────────────────────

// Mode 1 — Topic explanation (Briefing tab)
const askTopicSocrates = async () => {
  if (isTopicSocratesThinking.value || !topicSocratesQuery.value.trim()) return;
  const query = topicSocratesQuery.value;
  topicSocratesQuery.value = '';
  showTopicSocrates.value = true;
  isTopicSocratesThinking.value = true;
  topicChatHistory.value.push({ role: 'user', text: query });
  try {
    const response = await Agents.Socrates.explainTopic(
      query,
      socratesBriefingContext.value,
      props.student.yearLevel
    );
    topicChatHistory.value.push({ role: 'socrates', text: response });
  } catch {
    topicChatHistory.value.push({ role: 'socrates', text: 'Let me think about that. Which specific part is unclear?' });
  } finally {
    isTopicSocratesThinking.value = false;
  }
};

// Mode 2 — Question hint (Practice/Test)
const askHintSocrates = async () => {
  if (isHintSocratesThinking.value || !hintSocratesQuery.value.trim()) return;
  const query = hintSocratesQuery.value;
  hintSocratesQuery.value = '';
  showHintSocrates.value = true;
  isHintSocratesThinking.value = true;
  hintChatHistory.value.push({ role: 'user', text: query });
  try {
    const response = await Agents.Socrates.hintForQuestion(
      query,
      { text: question.value?.text || '', hint: question.value?.hint, explanation: question.value?.explanation },
      { overview: socratesQuestionContext.value.overview, formulas: socratesQuestionContext.value.formulas, steps: socratesQuestionContext.value.steps, mistakes: socratesQuestionContext.value.mistakes },
      props.student.yearLevel
    );
    hintChatHistory.value.push({ role: 'socrates', text: response });
  } catch {
    hintChatHistory.value.push({ role: 'socrates', text: 'Think about which formula applies to this type of question.' });
  } finally {
    isHintSocratesThinking.value = false;
  }
};

// ── Navigation ─────────────────────────────────────────────────────────────────
const handleNext = () => {
  if (practiceProgress.value >= 100 && phase.value !== 'test') {
    phase.value = 'test';
    fetchQuestion(true);
    return;
  }
  fetchQuestion(phase.value === 'test');
};

const switchToTest = () => {
  if (!canAccessTest.value) return;
  // Reset hint chat when entering test
  hintChatHistory.value = [];
  phase.value = 'test';
  fetchQuestion(true);
};

onMounted(loadSynthesis);
</script>

<template>
  <div class="pb-10 animate-in fade-in duration-500 relative h-full">

    <!-- ══ TOPIC SOCRATES SIDEBAR (Briefing — concept explanation) ══════════ -->
    <div v-if="showTopicSocrates" class="fixed inset-y-0 right-0 w-full sm:w-80 bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-[100] border-l-2 border-emerald-500 flex flex-col animate-in slide-in-from-right duration-300">
      <div class="p-4 border-b bg-emerald-600 text-white flex justify-between items-center">
        <div>
          <h3 class="font-black text-sm leading-none">Topic Tutor 📖</h3>
          <p class="text-[7px] font-bold uppercase tracking-widest opacity-70 mt-0.5">Ask anything about {{ topic.name }}</p>
        </div>
        <button @click="showTopicSocrates = false" class="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center font-black text-xs">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        <div v-if="!topicChatHistory.length" class="text-center py-6 space-y-2">
          <p class="text-2xl">📚</p>
          <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ask anything about this topic</p>
          <div class="space-y-1.5 text-left">
            <div v-for="eg in [`What is ${topic.name}?`, 'Can you explain with an example?', 'What formulas do I need?']" :key="eg"
              @click="topicSocratesQuery = eg; askTopicSocrates()"
              class="bg-white border border-slate-200 rounded-xl p-2 text-[9px] font-bold text-slate-600 cursor-pointer hover:border-emerald-400 hover:text-emerald-700 transition-all">
              💬 {{ eg }}
            </div>
          </div>
        </div>
        <div v-for="(chat, i) in topicChatHistory" :key="i"
          :class="['p-3 rounded-xl max-w-[90%] text-[11px] font-bold leading-relaxed shadow-sm',
            chat.role === 'user'
              ? 'ml-auto bg-emerald-600 text-white rounded-br-none'
              : 'mr-auto bg-white border border-slate-100 text-slate-700 rounded-bl-none']">
          {{ chat.text }}
        </div>
        <div v-if="isTopicSocratesThinking" class="mr-auto bg-white p-3 rounded-xl flex gap-1 border border-slate-100 shadow-sm">
          <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce"></div>
          <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce delay-75"></div>
          <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce delay-150"></div>
        </div>
      </div>
      <div class="p-3 bg-white border-t flex gap-2">
        <input v-model="topicSocratesQuery" @keyup.enter="askTopicSocrates" placeholder="Ask about this topic..."
          class="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-emerald-400" />
        <button @click="askTopicSocrates" :disabled="isTopicSocratesThinking"
          class="w-8 h-8 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50 text-xs">↑</button>
      </div>
    </div>

    <!-- ══ HINT SOCRATES SIDEBAR (Practice/Test — question hint only) ═══════ -->
    <div v-if="showHintSocrates" class="fixed inset-y-0 right-0 w-full sm:w-80 bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-[100] border-l-2 border-indigo-600 flex flex-col animate-in slide-in-from-right duration-300">
      <div class="p-4 border-b bg-indigo-600 text-white flex justify-between items-center">
        <div>
          <h3 class="font-black text-sm leading-none">Question Hint 💡</h3>
          <p class="text-[7px] font-bold uppercase tracking-widest opacity-70 mt-0.5">Guides you — never gives the answer</p>
        </div>
        <button @click="showHintSocrates = false" class="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center font-black text-xs">✕</button>
      </div>
      <!-- Current question reminder -->
      <div v-if="question" class="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
        <p class="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1">Current question</p>
        <p class="text-[10px] font-bold text-indigo-800 leading-snug line-clamp-3">{{ question.text }}</p>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        <div v-if="!hintChatHistory.length" class="text-center py-4">
          <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tell me where you're stuck</p>
          <p class="text-[8px] text-slate-300 font-bold mt-1">I'll guide you without giving the answer</p>
        </div>
        <div v-for="(chat, i) in hintChatHistory" :key="i"
          :class="['p-3 rounded-xl max-w-[90%] text-[11px] font-bold leading-relaxed shadow-sm',
            chat.role === 'user'
              ? 'ml-auto bg-indigo-600 text-white rounded-br-none'
              : 'mr-auto bg-white border border-slate-100 text-slate-700 rounded-bl-none']">
          {{ chat.text }}
        </div>
        <div v-if="isHintSocratesThinking" class="mr-auto bg-white p-3 rounded-xl flex gap-1 border border-slate-100 shadow-sm">
          <div class="w-1 h-1 bg-indigo-400 rounded-full animate-bounce"></div>
          <div class="w-1 h-1 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
          <div class="w-1 h-1 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
        </div>
      </div>
      <div class="p-3 bg-white border-t flex gap-2">
        <input v-model="hintSocratesQuery" @keyup.enter="askHintSocrates" placeholder="Where are you stuck?"
          class="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-indigo-400" />
        <button @click="askHintSocrates" :disabled="isHintSocratesThinking"
          class="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50 text-xs">↑</button>
      </div>
    </div>

    <!-- ══ TOP NAV ══════════════════════════════════════════════════════════ -->
    <div class="flex justify-between items-center mb-4 bg-white p-3 rounded-[2rem] border shadow-sm sticky top-2 z-40 gap-3 flex-wrap">
      <div class="flex items-center gap-3">
        <button @click="emit('exit')" class="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center font-black text-slate-400 hover:text-indigo-600 transition-all text-sm">←</button>
        <div>
          <h2 class="text-xs font-black text-slate-800 leading-none">{{ topic.name }}</h2>
          <div class="flex items-center gap-1 mt-0.5">
            <div :class="['inline-block px-1.5 py-0.5 rounded text-[6px] font-black uppercase tracking-widest border',
              briefingCount > 0 ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100']">
              {{ briefingCount > 0 ? `${briefingCount} Note${briefingCount > 1 ? 's' : ''} + Curriculum` : 'Standard Curriculum' }}
            </div>
          </div>
        </div>
      </div>
      <!-- IMPROVEMENT 5: Test tab locked until MIN_PRACTICE_FOR_TEST -->
      <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-full">
        <button @click="phase = 'briefing'"
          :class="['px-4 py-1.5 rounded-full text-[9px] font-black transition-all uppercase tracking-widest',
            phase === 'briefing' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600']">
          Briefing
        </button>
        <button @click="phase = 'practice'; fetchQuestion(false)"
          :class="['px-4 py-1.5 rounded-full text-[9px] font-black transition-all uppercase tracking-widest',
            phase === 'practice' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600']">
          Practice
        </button>
        <button @click="switchToTest" :disabled="!canAccessTest"
          :title="canAccessTest ? 'Mastery Test' : `Complete ${MIN_PRACTICE_FOR_TEST}% practice first`"
          :class="['px-4 py-1.5 rounded-full text-[9px] font-black transition-all uppercase tracking-widest relative',
            phase === 'test' ? 'bg-amber-500 text-white shadow-md' :
            canAccessTest ? 'text-slate-400 hover:text-slate-600' : 'text-slate-300 cursor-not-allowed']">
          Test
          <span v-if="!canAccessTest" class="absolute -top-0.5 -right-0.5 text-[6px]">🔒</span>
        </button>
      </div>
      <div class="px-3 py-1 bg-slate-900 rounded-xl text-white font-black text-[9px] shadow-md">
        {{ Math.round(practiceProgress) }}% Mastery
      </div>
    </div>

    <!-- ══ BRIEFING PHASE ═══════════════════════════════════════════════════ -->
    <div v-if="phase === 'briefing'" class="space-y-4">

      <!-- Sub-tab bar -->
      <div class="flex flex-wrap gap-1 items-center justify-center bg-white p-1 rounded-full border shadow-sm w-fit mx-auto">
        <button v-for="t in ['Concept', 'Flashcards', 'Cheat Sheet', 'My Notes']" :key="t" @click="briefingTab = t"
          :class="['px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all',
            briefingTab === t ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-400 hover:text-slate-600']">
          {{ t }}{{ t === 'My Notes' && briefingCount > 0 ? ` (${briefingCount})` : '' }}
        </button>
      </div>

      <div class="bg-white rounded-[2rem] p-6 border shadow-xl relative overflow-hidden min-h-[300px]">

        <!-- Synthesis spinner -->
        <div v-if="isSynthesizingHub" class="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-center px-6">
          <div class="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
          <p class="font-black text-slate-800 uppercase tracking-widest text-[10px]">
            {{ briefingCount > 0 ? 'Combining your notes with curriculum...' : 'Loading curriculum content...' }}
          </p>
          <p class="text-[8px] text-slate-400 font-bold mt-1">{{ briefingCount > 0 ? 'Notes + Curriculum = personalised study guide' : 'Generating AI study content' }}</p>
        </div>

        <!-- TAB: CONCEPT -->
        <div v-if="briefingTab === 'Concept'" class="space-y-5 animate-in fade-in">

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-xs shadow-md">📖</span>
                <h3 class="text-base font-black text-slate-800 uppercase tracking-tight">
                  {{ briefingCount > 0 ? 'Notes + Curriculum' : 'Curriculum Playbook' }}
                </h3>
              </div>
              <!-- Source indicator -->
              <div v-if="briefingCount > 0 && isHubSynced" class="text-[7px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                ✓ Notes merged
              </div>
            </div>
            <p class="text-slate-600 font-bold text-sm leading-relaxed border-l-2 border-indigo-100 pl-4">{{ activePlaybook }}</p>
          </div>
          <div v-if="activeLogicSteps.length" class="space-y-2">
            <h4 class="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Logic Flow</h4>
            <div class="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-1">
              <div v-for="(step, idx) in activeLogicSteps" :key="idx" class="flex gap-3 items-start p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span class="w-5 h-5 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-[8px] text-slate-400 font-black shrink-0">{{ idx + 1 }}</span>
                <p class="text-[10px] font-bold text-slate-700 pt-0.5">{{ step }}</p>
              </div>
            </div>
          </div>
          <!-- Ask about topic button -->
          <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center justify-between gap-3">
            <div>
              <p class="text-[10px] font-black text-emerald-700">Have a question about this topic?</p>
              <p class="text-[8px] text-emerald-600 font-bold">Ask and get a clear explanation — not just hints</p>
            </div>
            <button @click="showTopicSocrates = true"
              class="px-3 py-2 bg-emerald-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest flex-shrink-0 hover:bg-emerald-700 transition-all">
              Ask 📚
            </button>
          </div>
        </div>

        <!-- TAB: FLASHCARDS -->
        <div v-else-if="briefingTab === 'Flashcards'" class="animate-in fade-in">
          <div v-if="!activeFlashcards.length" class="py-10 text-center text-slate-300">
            <span class="text-4xl block mb-2">📭</span>
            <p class="font-black text-[9px] uppercase tracking-widest">No flashcards yet.</p>
            <p class="text-[8px] text-slate-300 font-bold mt-1">Upload your notes in "My Notes" to generate custom flashcards.</p>
          </div>
          <div v-else>
            <div v-if="briefingCount > 0" class="mb-3 text-[8px] font-black text-indigo-500 uppercase tracking-widest text-center">
              {{ activeFlashcards.length }} cards — curriculum + your notes combined
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-1">
              <div v-for="(card, i) in activeFlashcards" :key="i" @click="toggleCard(i)"
                :class="['p-4 rounded-xl border-2 cursor-pointer transition-all active:scale-95 text-center min-h-[100px] flex flex-col items-center justify-center gap-2',
                  revealedCards.has(i) ? 'border-emerald-500 bg-emerald-50 shadow-md' : 'border-slate-50 bg-white hover:border-indigo-200 shadow-sm']">
                <p class="font-black text-[12px] leading-tight" :class="revealedCards.has(i) ? 'text-emerald-900' : 'text-slate-800'">
                  {{ revealedCards.has(i) ? card.back : card.front }}
                </p>
                <span class="text-[7px] font-black text-indigo-500 uppercase tracking-widest opacity-40">{{ revealedCards.has(i) ? 'Reset' : 'Reveal' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB: CHEAT SHEET -->
        <div v-else-if="briefingTab === 'Cheat Sheet'" class="space-y-4 animate-in fade-in">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[380px] overflow-y-auto pr-1">
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <span class="text-base">⚡</span>
                <h4 class="text-[11px] font-black uppercase tracking-widest text-slate-800">Formulas</h4>
              </div>
              <div class="space-y-1.5">
                <div v-if="!activeFormulas.length" class="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[9px] font-bold text-slate-400 italic">No formulas captured yet.</div>
                <div v-for="formula in activeFormulas" :key="formula" class="p-3 bg-indigo-50 border border-indigo-100 rounded-xl font-black text-indigo-700 text-[10px] shadow-sm">
                  {{ formula }}
                </div>
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <span class="text-base">⚠️</span>
                <h4 class="text-[11px] font-black uppercase tracking-widest text-slate-800">Common Traps</h4>
              </div>
              <div class="space-y-1.5">
                <div v-if="!activeMistakes.length" class="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[9px] font-bold text-slate-400 italic">No traps identified yet.</div>
                <div v-for="mistake in activeMistakes" :key="mistake" class="p-3 bg-rose-50 border border-rose-100 rounded-xl font-black text-rose-700 text-[10px] shadow-sm flex gap-2 items-start">
                  <span class="shrink-0">🚫</span>
                  <span>{{ mistake }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="bg-slate-900 p-3 rounded-xl text-white flex items-center justify-between gap-4 shadow-lg">
            <div>
              <h4 class="text-[10px] font-black uppercase tracking-tight text-indigo-400">Pro Tip</h4>
              <p class="text-[9px] font-bold text-slate-300 leading-relaxed">{{ activeProTip }}</p>
            </div>
            <div class="text-xl">💡</div>
          </div>
        </div>

        <!-- TAB: MY NOTES -->
        <div v-else-if="briefingTab === 'My Notes'" class="space-y-4 animate-in fade-in">
          <div class="border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all"
            :class="isProcessingNote ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 hover:border-indigo-400'"
            @click="!isProcessingNote && triggerNoteUpload()">
            <div v-if="isProcessingNote" class="space-y-2">
              <div class="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
              <p class="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Reading your notes...</p>
              <p class="text-[8px] text-slate-400 font-bold">Extracting and combining with curriculum</p>
            </div>
            <div v-else class="space-y-2">
              <p class="text-2xl">📎</p>
              <p class="text-[11px] font-black text-slate-700">Upload your {{ topic.name }} notes</p>
              <p class="text-[8px] text-slate-400 font-bold">Your notes + curriculum = personalised study guide</p>
              <p class="text-[8px] text-slate-300 font-bold uppercase tracking-widest">JPG · PNG · PDF · Max 10MB</p>
            </div>
            <input ref="noteFileInput" type="file" accept="image/*,.pdf" class="hidden" @change="handleNoteFile" />
          </div>

          <p v-if="noteUploadError" class="text-[9px] font-bold text-rose-500 text-center">{{ noteUploadError }}</p>

          <!-- How it works -->
          <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-3">
            <p class="text-[9px] font-black text-indigo-700 uppercase tracking-widest">How it works</p>
            <div class="space-y-2 text-[9px] font-bold text-indigo-700">
              <div class="flex items-start gap-2">
                <span class="text-emerald-500 flex-shrink-0">✓</span>
                <span>Your notes are combined WITH the standard curriculum — not instead of it</span>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-emerald-500 flex-shrink-0">✓</span>
                <span>Flashcards include both curriculum fundamentals and your teacher's examples</span>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-emerald-500 flex-shrink-0">✓</span>
                <span>Practice questions are weighted toward what your notes emphasise</span>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-emerald-500 flex-shrink-0">✓</span>
                <span>Everything saved to your profile for next session</span>
              </div>
            </div>
          </div>

          <!-- Uploaded notes list -->
          <div v-if="briefingCount > 0" class="space-y-2">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Uploaded Notes ({{ briefingCount }})</p>
            <div v-for="entry in briefingVault" :key="entry.id" class="flex items-center gap-3 bg-slate-50 rounded-2xl p-3 border border-slate-100">
              <span class="text-lg flex-shrink-0">📄</span>
              <div class="flex-1 min-w-0">
                <p class="text-[10px] font-black text-slate-800 truncate">{{ entry.fileName || 'Uploaded note' }}</p>
                <p class="text-[8px] text-slate-400 font-bold">{{ entry.date ? new Date(entry.date).toLocaleDateString() : 'Previously uploaded' }} · In curriculum mix ✓</p>
              </div>
            </div>
            <div v-for="entry in uploadedNotes" :key="entry.id" class="flex items-center gap-3 bg-emerald-50 rounded-2xl p-3 border border-emerald-100">
              <span class="text-lg flex-shrink-0">📄</span>
              <div class="flex-1 min-w-0">
                <p class="text-[10px] font-black text-slate-800 truncate">{{ entry.fileName }}</p>
                <p class="text-[8px] text-emerald-600 font-bold">Just uploaded · Combined with curriculum ✓</p>
              </div>
              <button @click="deleteNote(entry.id)" class="w-6 h-6 bg-rose-100 rounded-lg flex items-center justify-center text-rose-400 text-xs hover:bg-rose-200 flex-shrink-0">✕</button>
            </div>
          </div>
          <div v-else class="text-center py-4">
            <p class="text-[9px] text-slate-400 font-bold">No notes uploaded yet for this topic.</p>
            <p class="text-[8px] text-slate-300 font-bold mt-1">Using standard GCSE curriculum. Upload notes to personalise.</p>
          </div>
        </div>
      </div>

      <button @click="phase = 'practice'; fetchQuestion(false)"
        class="w-full mt-2 py-3 bg-indigo-600 text-white rounded-[1.5rem] font-black text-sm shadow-xl border-b-4 border-indigo-900 transition-all hover:bg-indigo-700 hover:scale-[1.01] active:scale-95">
        Enter Practice Arena →
      </button>
    </div>

    <!-- ══ PRACTICE & TEST PHASES ═══════════════════════════════════════════ -->
    <div v-else-if="['practice', 'test'].includes(phase)" class="max-w-xl mx-auto space-y-3">

      <!-- Test mode warning if accessed early (shouldn't happen now, but safety net) -->
      <div v-if="phase === 'test' && !canAccessTest" class="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
        <p class="text-[10px] font-black text-amber-700">Complete at least {{ MIN_PRACTICE_FOR_TEST }}% practice first</p>
        <button @click="phase = 'practice'" class="mt-2 px-4 py-1.5 bg-amber-500 text-white rounded-xl font-black text-[9px] uppercase tracking-widest">Go to Practice</button>
      </div>

      <div v-if="loading" class="bg-white p-8 rounded-[2rem] text-center shadow-xl flex flex-col items-center">
        <div class="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
        <p class="font-black text-slate-800 text-sm uppercase tracking-widest">
          {{ phase === 'test' ? 'Preparing mastery test...' : briefingCount > 0 ? 'Generating from your notes + curriculum...' : 'Generating question...' }}
        </p>
      </div>

      <div v-else class="space-y-3 animate-in zoom-in-95">
        <div class="bg-white p-6 rounded-[2rem] border-2 shadow-xl relative"
          :class="phase === 'test' ? 'border-amber-400' : 'border-slate-50'">

          <div v-if="!question" class="py-6 text-center space-y-3">
            <span class="text-4xl block animate-bounce">🧬</span>
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">{{ error || 'No question loaded' }}</p>
            <button @click="fetchQuestion(phase === 'test')" class="px-6 py-2 bg-indigo-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg">Retry</button>
          </div>

          <div v-else class="space-y-4">
            <!-- Badges -->
            <div class="flex flex-wrap gap-1">
              <span class="text-[6px] font-black px-2 py-0.5 bg-slate-100 rounded text-slate-500 uppercase tracking-widest">{{ difficulty }}</span>
              <span v-if="phase === 'test'" class="text-[6px] font-black px-2 py-0.5 bg-amber-100 text-amber-600 rounded uppercase tracking-widest">⭐ Mastery Test</span>
              <span v-if="briefingCount > 0" class="text-[6px] font-black px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded uppercase tracking-widest">Notes + curriculum</span>
            </div>

            <h2 class="text-base font-black text-slate-800 leading-snug">{{ question?.text }}</h2>

            <!-- MCQ options -->
            <div v-if="question?.options?.length" class="grid grid-cols-1 gap-2">
              <button v-for="opt in question.options" :key="opt"
                @click="!assessment && (userAnswer = opt)"
                :class="['p-3 rounded-xl border-2 text-left font-black text-[11px] transition-all',
                  userAnswer === opt
                    ? (assessment
                        ? (assessment.isCorrect ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-rose-500 bg-rose-50 text-rose-900')
                        : 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-md')
                    : 'border-slate-50 bg-white text-slate-500 hover:border-slate-200']">
                {{ opt }}
              </button>
            </div>

            <!-- Open-ended answer -->
            <textarea v-else v-model="userAnswer" :disabled="!!assessment"
              class="w-full p-4 bg-slate-50 rounded-xl h-24 font-bold text-xs border-transparent outline-none focus:bg-white focus:border-indigo-400 transition-all shadow-inner resize-none"
              placeholder="Explain your thinking..."></textarea>

            <!-- Assessment result -->
            <div v-if="assessment" class="animate-in slide-in-from-top-1">
              <div :class="['p-4 rounded-xl border-2 flex gap-3 items-start',
                assessment.isCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-rose-50 border-rose-100 text-rose-900']">
                <span class="text-2xl">{{ assessment.isCorrect ? '✨' : '🧐' }}</span>
                <div class="space-y-0.5">
                  <h4 class="text-[10px] font-black uppercase tracking-widest">{{ assessment.affirmation }}</h4>
                  <p class="text-[9px] font-bold opacity-80 leading-relaxed">{{ assessment.feedback }}</p>
                  <p v-if="!assessment.isCorrect && assessment.correctiveHint" class="text-[9px] font-bold opacity-60 leading-relaxed mt-1">💡 {{ assessment.correctiveHint }}</p>
                </div>
              </div>
            </div>

            <!-- Action row — Need a hint? button (not Ask Socrates) -->
            <div class="pt-4 flex justify-between items-center border-t border-slate-50">
              <!-- Hint button — only in practice, not test -->
              <button v-if="phase !== 'test'" @click="showHintSocrates = true"
                class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg font-black text-[7px] uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                Need a hint? 💡
              </button>
              <div v-else class="text-[7px] font-black text-amber-500 uppercase tracking-widest">Test mode — no hints</div>

              <button v-if="!assessment" @click="submitAnswer" :disabled="!userAnswer || checking"
                class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs shadow-lg border-b-2 border-indigo-900 transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
                {{ checking ? 'Checking...' : 'Check It! →' }}
              </button>
              <button v-else @click="handleNext"
                class="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs shadow-lg border-b-2 border-slate-950 transition-all hover:scale-105 active:scale-95">
                {{ practiceProgress >= 100 && phase !== 'test' ? 'Final Mastery Test →' : 'Next Question →' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Practice progress bar -->
        <div v-if="phase === 'practice'" class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2">
          <div class="flex justify-between text-[8px] font-black uppercase tracking-widest">
            <span class="text-slate-400">Practice Progress</span>
            <span :class="practiceProgress >= MIN_PRACTICE_FOR_TEST ? 'text-indigo-600' : 'text-slate-400'">
              {{ Math.round(practiceProgress) }}% — {{ practiceProgress >= 100 ? 'Ready for test!' : practiceProgress >= MIN_PRACTICE_FOR_TEST ? 'Test unlocked 🔓' : `${MIN_PRACTICE_FOR_TEST - Math.round(practiceProgress)}% to unlock test` }}
            </span>
          </div>
          <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500"
              :class="practiceProgress >= 100 ? 'bg-emerald-500' : practiceProgress >= MIN_PRACTICE_FOR_TEST ? 'bg-indigo-500' : 'bg-indigo-300'"
              :style="{ width: Math.min(100, practiceProgress) + '%' }">
            </div>
          </div>
          <!-- Milestone markers -->
          <div class="flex justify-between text-[7px] text-slate-300 font-bold">
            <span>0%</span>
            <span :class="practiceProgress >= MIN_PRACTICE_FOR_TEST ? 'text-indigo-500 font-black' : ''">{{ MIN_PRACTICE_FOR_TEST }}% (test unlock)</span>
            <span :class="practiceProgress >= 100 ? 'text-emerald-500 font-black' : ''">100%</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>