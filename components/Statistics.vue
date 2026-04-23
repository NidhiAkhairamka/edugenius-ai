<script setup>
import { ref, onMounted, computed } from 'vue';
import { db } from '../services/dbService';
import { CURRICULUM } from '../constants';

const props = defineProps(['student']);
const emit = defineEmits(['back']);

// ── State ─────────────────────────────────────────────────────────────────────
const logs = ref([]);
const activeTab = ref('student');

// Parent PIN
const parentPin = ref('');
const parentPinInput = ref('');
const pinError = ref('');
const parentUnlocked = ref(false);
const showPinSetup = ref(false);
const newPin = ref('');
const confirmNewPin = ref('');
const pinSetupError = ref('');

// ── Mock exam results (from localStorage, same key MockExam.vue uses) ─────────
const mockPapers = ref([]);

onMounted(async () => {
  logs.value = await db.getQuestionLogs(props.student.name);
  parentPin.value = localStorage.getItem(`edugenius_parent_pin_${props.student.name}`) || '';
  // Load mock exam papers
  try {
    mockPapers.value = JSON.parse(
      localStorage.getItem(`edugenius_mock_papers_${props.student.name}`) || '[]'
    );
  } catch { mockPapers.value = []; }
});

// ── Real skill computation ────────────────────────────────────────────────────
const computedSkills = computed(() => {
  const all = logs.value;
  const empty = [
    { label: 'Calculation', val: 0, icon: '🔢', color: 'from-violet-500 to-indigo-500' },
    { label: 'Theory',      val: 0, icon: '📖', color: 'from-emerald-500 to-teal-500' },
    { label: 'Application', val: 0, icon: '🛠️', color: 'from-amber-500 to-orange-500' },
    { label: 'Persistence', val: 0, icon: '⏳', color: 'from-rose-500 to-pink-500' },
  ];
  if (!all.length) return empty;

  const mathLogs = all.filter(l => l.subject === 'Maths');
  const sciLogs  = all.filter(l => l.subject === 'Science');
  const advLogs  = all.filter(l => l.difficulty === 'Advanced');

  const calc    = mathLogs.length ? Math.round(mathLogs.filter(l => l.isCorrect).length / mathLogs.length * 100) : 0;
  const theory  = sciLogs.length  ? Math.round(sciLogs.filter(l => l.isCorrect).length  / sciLogs.length  * 100) : 0;
  const app     = advLogs.length  ? Math.round(advLogs.filter(l => l.isCorrect).length  / advLogs.length  * 100) : 0;
  const persist = Math.min(100, Math.round(all.length / 10 * 100));

  return [
    { label: 'Calculation', val: calc,    icon: '🔢', color: 'from-violet-500 to-indigo-500' },
    { label: 'Theory',      val: theory,  icon: '📖', color: 'from-emerald-500 to-teal-500' },
    { label: 'Application', val: app,     icon: '🛠️', color: 'from-amber-500 to-orange-500' },
    { label: 'Persistence', val: persist, icon: '⏳', color: 'from-rose-500 to-pink-500' },
  ];
});

const overallAccuracy = computed(() =>
  logs.value.length ? Math.round(logs.value.filter(l => l.isCorrect).length / logs.value.length * 100) : 0
);
const totalQuestions = computed(() => logs.value.length);
const totalCorrect = computed(() => logs.value.filter(l => l.isCorrect).length);
const totalCompleted = computed(() =>
  Object.values(props.student.masteryData || {}).filter(m => m.status === 'completed').length
);

// ── Topic heatmap ─────────────────────────────────────────────────────────────
const topicHeatmap = computed(() => {
  const yearTopics = CURRICULUM.filter(t => t.year === props.student.yearLevel);
  return yearTopics.map(topic => {
    const m = props.student.masteryData?.[topic.id];
    if (!m) return { ...topic, status: 'untouched', score: 0 };
    const score = m.score || 0;
    let status = 'started';
    if (m.status === 'completed') status = 'mastered';
    else if (score >= 50) status = 'good';
    else if (score > 0) status = 'struggling';
    return { ...topic, status, score };
  });
});

// ── 30-day graph ──────────────────────────────────────────────────────────────
const thirtyDayData = computed(() => {
  const days = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString();
    const dayLogs = logs.value.filter(l => new Date(l.timestamp).toLocaleDateString() === dateStr);
    const correct = dayLogs.filter(l => l.isCorrect).length;
    days.push({
      label: i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      total: dayLogs.length, correct,
      accuracy: dayLogs.length ? Math.round(correct / dayLogs.length * 100) : 0
    });
  }
  return days;
});
const maxDayTotal = computed(() => Math.max(...thirtyDayData.value.map(d => d.total), 1));
const hasActivity = computed(() => thirtyDayData.value.some(d => d.total > 0));
const weakTopics = computed(() => topicHeatmap.value.filter(t => t.status === 'struggling').slice(0, 3));

// ── Mock exam computed ────────────────────────────────────────────────────────
const markedPapers = computed(() => mockPapers.value.filter(p => p.status === 'marked'));
const latestMock = computed(() => markedPapers.value[0] || null);

const mockGrade = (pct) => {
  if (pct >= 90) return 'A*';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'U';
};
const mockGradeColor = (pct) => {
  if (pct >= 70) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (pct >= 50) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-rose-600 bg-rose-50 border-rose-200';
};

const mockPaperScore = (paper) => {
  let a = 0, t = 0;
  paper.sections?.forEach(s => s.questions?.forEach(q => { a += q.awardedMarks || 0; t += q.marks || 0; }));
  return { awarded: a, total: t, pct: t ? Math.round(a / t * 100) : 0 };
};

const latestMockScore = computed(() => latestMock.value ? mockPaperScore(latestMock.value) : null);

// Improvement trend across mocks
const mockTrend = computed(() => {
  if (markedPapers.value.length < 2) return null;
  const recent = mockPaperScore(markedPapers.value[0]).pct;
  const prev = mockPaperScore(markedPapers.value[1]).pct;
  const delta = recent - prev;
  return { delta, up: delta > 0, label: delta > 0 ? `+${delta}%` : `${delta}%` };
});

// Weakest topics across all mock papers
const mockWeakTopics = computed(() => {
  const topicScores = {};
  markedPapers.value.forEach(paper => {
    paper.sections?.forEach(sec => {
      const topic = sec.topic || sec.title || 'Unknown';
      const a = sec.questions?.reduce((s, q) => s + (q.awardedMarks || 0), 0) || 0;
      const t = sec.questions?.reduce((s, q) => s + (q.marks || 0), 0) || 0;
      if (!topicScores[topic]) topicScores[topic] = { awarded: 0, total: 0 };
      topicScores[topic].awarded += a;
      topicScores[topic].total += t;
    });
  });
  return Object.entries(topicScores)
    .map(([topic, { awarded, total }]) => ({ topic, pct: total ? Math.round(awarded / total * 100) : 0 }))
    .filter(t => t.pct < 70)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 4);
});

// ── AI Readiness Summary ──────────────────────────────────────────────────────
const aiReadinessSummary = computed(() => {
  const mastered = totalCompleted.value;
  const total = topicHeatmap.value.length;
  const pct = total ? Math.round(mastered / total * 100) : 0;
  const acc = overallAccuracy.value;
  const mockInfo = latestMockScore.value
    ? ` Latest mock exam: ${mockGrade(latestMockScore.value.pct)} (${latestMockScore.value.pct}%).`
    : ' No mock exams attempted yet.';
  const weak = weakTopics.value.map(t => t.name).join(', ') || 'none identified yet';

  if (!mastered) return `${props.student.name} has just enrolled. No topics completed yet.${mockInfo}`;
  if (pct < 30) return `${props.student.name} is in early stages — ${mastered} topic${mastered > 1 ? 's' : ''} mastered (${pct}%). Accuracy: ${acc}%. Focus areas: ${weak}.${mockInfo}`;
  if (pct < 70) return `${props.student.name} is progressing well — ${mastered}/${total} topics mastered (${pct}%). Accuracy: ${acc}%. Weak areas: ${weak}.${mockInfo}`;
  return `${props.student.name} is performing strongly — ${mastered}/${total} mastered (${pct}%). Accuracy: ${acc}%.${mockInfo}`;
});

// ── Heatmap helpers ───────────────────────────────────────────────────────────
const heatColor = (s) => ({ mastered: 'bg-emerald-500 text-white', good: 'bg-emerald-200 text-emerald-800', struggling: 'bg-rose-200 text-rose-700', started: 'bg-amber-100 text-amber-700', untouched: 'bg-slate-100 text-slate-400' })[s] || 'bg-slate-100 text-slate-400';
const heatIcon  = (s) => ({ mastered: '⭐', good: '✅', struggling: '⚠️', started: '▶️', untouched: '○' })[s] || '○';

// ── Parent PIN ────────────────────────────────────────────────────────────────
const handleParentTab = () => {
  activeTab.value = 'parent';
  if (!parentPin.value) showPinSetup.value = true;
};
const saveParentPin = () => {
  if (newPin.value.length < 4) { pinSetupError.value = 'PIN must be 4+ digits.'; return; }
  if (newPin.value !== confirmNewPin.value) { pinSetupError.value = 'PINs do not match.'; return; }
  parentPin.value = newPin.value;
  localStorage.setItem(`edugenius_parent_pin_${props.student.name}`, newPin.value);
  showPinSetup.value = false;
  parentUnlocked.value = true;
  newPin.value = ''; confirmNewPin.value = ''; pinSetupError.value = '';
};
const unlockParent = () => {
  if (parentPinInput.value === parentPin.value) { parentUnlocked.value = true; pinError.value = ''; parentPinInput.value = ''; }
  else pinError.value = 'Incorrect PIN.';
};
const lockParent = () => { parentUnlocked.value = false; parentPinInput.value = ''; activeTab.value = 'student'; };

// ── Export ────────────────────────────────────────────────────────────────────
const isExporting = ref(false);
const exportFullDatabase = async () => {
  isExporting.value = true;
  try {
    const agentEyeVault = await db.getAllAgentEyeForUser(props.student.name);
    const briefingVault = await db.getAllBriefingForUser(props.student.name);
    const data = JSON.stringify({
      exportDate: new Date().toISOString(),
      tables: { profiles: [props.student], agent_eye_vault: agentEyeVault, briefing_vault: briefingVault, question_logs: logs.value, mock_papers: mockPapers.value }
    }, null, 2);
    const dl = document.createElement('a');
    dl.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(data));
    dl.setAttribute('download', `edugenius_export_${props.student.name}_${new Date().toISOString().split('T')[0]}.json`);
    dl.click();
  } finally { isExporting.value = false; }
};
</script>

<template>
  <div class="pb-32 space-y-5">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-black text-slate-800 tracking-tight">Progress Lab 🧪</h2>
        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Real-time analytics</p>
      </div>
      <button @click="emit('back')" class="px-4 py-2 bg-white border-2 border-slate-100 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm">← Back</button>
    </div>

    <!-- Tab switcher -->
    <div class="bg-slate-100 p-1 rounded-2xl flex gap-1">
      <button @click="activeTab = 'student'" :class="['flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all', activeTab === 'student' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400']">🎓 Student</button>
      <button @click="handleParentTab"       :class="['flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all', activeTab === 'parent'  ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400']">👨‍👩‍👧 Parent</button>
    </div>

    <!-- ════════════════════════════════════════════════════════════════════ -->
    <!-- STUDENT VIEW -->
    <!-- ════════════════════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'student'">

      <!-- Top stats -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
          <span class="text-2xl block mb-1">🔥</span>
          <p class="text-xl font-black text-slate-800">{{ student.streak }}</p>
          <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Streak</p>
        </div>
        <div class="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
          <span class="text-2xl block mb-1">🎯</span>
          <p class="text-xl font-black text-slate-800">{{ overallAccuracy }}%</p>
          <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Accuracy</p>
        </div>
        <div class="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
          <span class="text-2xl block mb-1">📚</span>
          <p class="text-xl font-black text-slate-800">{{ totalCompleted }}</p>
          <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Mastered</p>
        </div>
      </div>

      <!-- Mock exam results -->
      <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-sm font-black text-slate-800">Mock Exam Results</h3>
          <span class="text-[8px] font-bold text-slate-400">{{ markedPapers.length }} completed</span>
        </div>

        <div v-if="!markedPapers.length" class="p-8 text-center">
          <p class="text-2xl mb-2">📝</p>
          <p class="text-[10px] font-black text-slate-300 uppercase tracking-widest">No mock exams completed yet</p>
          <p class="text-[9px] text-slate-400 font-bold mt-1">Go to Mock Exam to generate your first paper</p>
        </div>

        <div v-else class="p-5 space-y-4">
          <!-- Latest mock highlight -->
          <div v-if="latestMock" class="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-4 text-white flex items-center gap-4">
            <div :class="['w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0 border-2', mockGradeColor(latestMockScore.pct)]">
              {{ mockGrade(latestMockScore.pct) }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[10px] font-black text-white truncate">{{ latestMock.title }}</p>
              <p class="text-[8px] text-slate-400 font-bold">
                {{ latestMockScore.awarded }}/{{ latestMockScore.total }} marks ({{ latestMockScore.pct }}%)
              </p>
              <p class="text-[8px] text-slate-400 font-bold">
                {{ (latestMock.topicsCovered || []).slice(0, 3).join(', ') }}{{ (latestMock.topicsCovered || []).length > 3 ? '...' : '' }}
              </p>
            </div>
            <div v-if="mockTrend" class="text-right flex-shrink-0">
              <p class="text-sm font-black" :class="mockTrend.up ? 'text-emerald-400' : 'text-rose-400'">
                {{ mockTrend.label }}
              </p>
              <p class="text-[7px] text-slate-400 font-bold">vs last</p>
            </div>
          </div>

          <!-- All mocks list -->
          <div class="space-y-2">
            <div v-for="paper in markedPapers" :key="paper.id" class="flex items-center gap-3 bg-slate-50 rounded-2xl p-3">
              <div :class="['w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black border-2 flex-shrink-0', mockGradeColor(mockPaperScore(paper).pct)]">
                {{ mockGrade(mockPaperScore(paper).pct) }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[10px] font-black text-slate-800 truncate">{{ paper.title }}</p>
                <p class="text-[8px] text-slate-400 font-bold">
                  {{ mockPaperScore(paper).awarded }}/{{ mockPaperScore(paper).total }} · {{ mockPaperScore(paper).pct }}%
                  <span v-if="paper.usedSchoolPaperStyle" class="text-indigo-400"> · school style</span>
                </p>
              </div>
              <span class="text-[8px] text-slate-400 font-bold flex-shrink-0">
                {{ paper.markedAt ? new Date(paper.markedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '' }}
              </span>
            </div>
          </div>

          <!-- Topics needing work from mocks -->
          <div v-if="mockWeakTopics.length" class="bg-rose-50 border border-rose-100 rounded-2xl p-4">
            <p class="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-2">Weak areas from mock exams</p>
            <div class="space-y-1.5">
              <div v-for="t in mockWeakTopics" :key="t.topic" class="flex items-center justify-between">
                <p class="text-[10px] font-bold text-slate-700">{{ t.topic }}</p>
                <span class="text-[9px] font-black text-rose-500">{{ t.pct }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Real skill bars -->
      <div class="bg-slate-900 rounded-3xl p-6 text-white space-y-5">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-black">Skill Assessment</h3>
          <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{{ totalQuestions }} questions</span>
        </div>
        <div v-if="!totalQuestions" class="py-4 text-center">
          <p class="text-[10px] text-slate-400 font-bold">Complete practice sessions to see real skill data.</p>
        </div>
        <div v-else class="space-y-4">
          <div v-for="skill in computedSkills" :key="skill.label" class="space-y-1.5">
            <div class="flex justify-between items-center">
              <span class="text-[10px] font-black uppercase tracking-widest opacity-80">{{ skill.icon }} {{ skill.label }}</span>
              <span class="text-[10px] font-black text-white/60">{{ skill.val }}%</span>
            </div>
            <div class="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-1000" :class="`bg-gradient-to-r ${skill.color}`" :style="{ width: skill.val + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 30-day activity graph -->
      <div class="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h3 class="text-sm font-black text-slate-800 mb-4">30-Day Activity</h3>
        <div v-if="!hasActivity" class="py-6 text-center">
          <p class="text-[10px] text-slate-300 font-bold uppercase tracking-widest">No activity recorded yet.</p>
        </div>
        <div v-else>
          <div class="flex items-end gap-0.5 h-16">
            <div v-for="(day, i) in thirtyDayData" :key="i" class="flex-1 flex items-end" :title="`${day.label}: ${day.total}Q, ${day.accuracy}% acc`">
              <div class="w-full rounded-t-sm"
                :class="day.total > 0 ? (day.accuracy >= 70 ? 'bg-emerald-400' : day.accuracy >= 40 ? 'bg-amber-400' : 'bg-rose-400') : 'bg-slate-100'"
                :style="{ height: day.total > 0 ? Math.max(4, day.total / maxDayTotal * 100) + '%' : '4px' }">
              </div>
            </div>
          </div>
          <div class="flex justify-between text-[7px] font-bold text-slate-300 mt-2 uppercase tracking-widest">
            <span>30 days ago</span><span>Today</span>
          </div>
          <div class="pt-2 border-t border-slate-100 flex gap-4 text-[9px] mt-2">
            <span class="font-bold text-slate-600">{{ totalQuestions }} total</span>
            <span class="font-bold text-emerald-600">{{ totalCorrect }} correct</span>
            <span class="font-bold text-slate-400">{{ totalQuestions - totalCorrect }} incorrect</span>
          </div>
        </div>
      </div>

      <!-- Topic heatmap -->
      <div class="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h3 class="text-sm font-black text-slate-800 mb-4">Topic Heatmap — Year {{ student.yearLevel }}</h3>
        <div class="flex flex-wrap gap-1.5">
          <div v-for="topic in topicHeatmap" :key="topic.id"
            :class="['px-2 py-1.5 rounded-xl text-[8px] font-black flex items-center gap-1', heatColor(topic.status)]"
            :title="`${topic.name}: ${topic.status} (${topic.score}%)`">
            <span>{{ heatIcon(topic.status) }}</span>
            <span class="max-w-[80px] truncate">{{ topic.name }}</span>
          </div>
        </div>
        <div class="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-3 text-[8px]">
          <span class="flex items-center gap-1 font-bold"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>Mastered</span>
          <span class="flex items-center gap-1 font-bold text-emerald-700"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-200 inline-block"></span>Good</span>
          <span class="flex items-center gap-1 font-bold text-rose-600"><span class="w-2.5 h-2.5 rounded-sm bg-rose-200 inline-block"></span>Struggling</span>
          <span class="flex items-center gap-1 font-bold text-amber-700"><span class="w-2.5 h-2.5 rounded-sm bg-amber-100 inline-block"></span>Started</span>
          <span class="flex items-center gap-1 font-bold text-slate-400"><span class="w-2.5 h-2.5 rounded-sm bg-slate-100 inline-block"></span>Not started</span>
        </div>
      </div>

      <!-- Weak spots -->
      <div v-if="weakTopics.length" class="bg-rose-50 rounded-3xl p-5 border border-rose-100">
        <h3 class="text-sm font-black text-rose-700 mb-3">⚠️ Practice Focus Areas</h3>
        <div class="space-y-2">
          <div v-for="t in weakTopics" :key="t.id" class="flex items-center justify-between bg-white rounded-xl p-3">
            <span class="text-[11px] font-black text-slate-800">{{ t.name }}</span>
            <span class="text-[9px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">{{ t.score }}% mastery</span>
          </div>
        </div>
      </div>

      <!-- Export -->
      <button @click="exportFullDatabase" :disabled="isExporting"
        class="w-full py-3 bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all disabled:opacity-50">
        {{ isExporting ? 'Exporting...' : '⬇ Export Full Data' }}
      </button>
    </template>

    <!-- ════════════════════════════════════════════════════════════════════ -->
    <!-- PARENT VIEW -->
    <!-- ════════════════════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'parent'">

      <!-- PIN setup -->
      <div v-if="showPinSetup" class="bg-white rounded-3xl p-8 border-2 border-indigo-100 shadow-sm text-center space-y-4">
        <div class="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-3xl mx-auto">🔐</div>
        <h3 class="text-base font-black text-slate-800">Set Parent PIN</h3>
        <p class="text-[10px] text-slate-500 font-bold">Protects this report from your child seeing it.</p>
        <div class="space-y-3">
          <input v-model="newPin" type="password" inputmode="numeric" maxlength="8" placeholder="Set PIN (4+ digits)"
            class="w-full text-center py-3 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-slate-800 focus:outline-none focus:border-indigo-400 text-sm" />
          <input v-model="confirmNewPin" type="password" inputmode="numeric" maxlength="8" placeholder="Confirm PIN"
            class="w-full text-center py-3 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-slate-800 focus:outline-none focus:border-indigo-400 text-sm" />
          <p v-if="pinSetupError" class="text-[9px] text-rose-500 font-bold">{{ pinSetupError }}</p>
          <button @click="saveParentPin" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all">Save PIN</button>
          <button @click="showPinSetup = false; activeTab = 'student'" class="w-full py-2 text-slate-400 font-bold text-[10px]">Cancel</button>
        </div>
      </div>

      <!-- PIN entry -->
      <div v-else-if="!parentUnlocked" class="bg-white rounded-3xl p-8 border-2 border-indigo-100 shadow-sm text-center space-y-4">
        <div class="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-3xl mx-auto">👨‍👩‍👧</div>
        <h3 class="text-base font-black text-slate-800">Parent Report</h3>
        <p class="text-[10px] text-slate-500 font-bold">Enter your PIN to view {{ student.name }}'s progress.</p>
        <input v-model="parentPinInput" type="password" inputmode="numeric" maxlength="8" placeholder="Enter parent PIN"
          class="w-full text-center py-3 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-slate-800 focus:outline-none focus:border-indigo-400 text-sm"
          @keyup.enter="unlockParent" />
        <p v-if="pinError" class="text-[9px] text-rose-500 font-bold">{{ pinError }}</p>
        <button @click="unlockParent" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700">Unlock Report</button>
        <button @click="activeTab = 'student'" class="w-full py-2 text-slate-400 font-bold text-[10px]">← Back</button>
      </div>

      <!-- Parent dashboard (unlocked) -->
      <template v-else>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-base">👨‍👩‍👧</div>
            <div>
              <p class="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Parent Report</p>
              <p class="text-xs font-black text-slate-800">{{ student.name }}</p>
            </div>
          </div>
          <button @click="lockParent" class="px-3 py-1.5 bg-slate-100 rounded-xl text-[8px] font-black uppercase tracking-widest text-slate-500">🔒 Lock</button>
        </div>

        <!-- AI summary -->
        <div class="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white">
          <p class="text-[8px] font-black uppercase tracking-widest opacity-70 mb-2">AI Readiness Assessment</p>
          <p class="text-[12px] font-bold leading-relaxed opacity-95">{{ aiReadinessSummary }}</p>
        </div>

        <!-- ── MOCK EXAM SECTION (parent) ── -->
        <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="text-sm font-black text-slate-800">Mock Exam Results</h3>
            <span class="text-[8px] font-bold text-slate-400">{{ markedPapers.length }} exam{{ markedPapers.length !== 1 ? 's' : '' }} taken</span>
          </div>

          <div v-if="!markedPapers.length" class="p-8 text-center">
            <p class="text-[10px] text-slate-400 font-bold">No mock exams completed yet.</p>
            <p class="text-[9px] text-slate-300 font-bold mt-1">Encourage {{ student.name }} to try one from the Mock Exam section.</p>
          </div>

          <div v-else class="p-5 space-y-4">
            <!-- Latest mock grade card -->
            <div v-if="latestMock" class="rounded-2xl p-5 border-2 flex items-center gap-4" :class="mockGradeColor(latestMockScore.pct)">
              <div class="text-center flex-shrink-0">
                <p class="text-4xl font-black">{{ mockGrade(latestMockScore.pct) }}</p>
                <p class="text-[8px] font-black uppercase tracking-widest opacity-70 mt-1">Latest</p>
              </div>
              <div class="flex-1">
                <p class="text-[10px] font-black text-slate-800">{{ latestMock.title }}</p>
                <p class="text-sm font-black text-slate-600">{{ latestMockScore.awarded }}/{{ latestMockScore.total }} marks ({{ latestMockScore.pct }}%)</p>
                <p class="text-[8px] text-slate-500 font-bold mt-1">
                  Topics: {{ (latestMock.topicsCovered || []).join(', ') || 'Not recorded' }}
                </p>
                <p v-if="latestMock.usedSchoolPaperStyle" class="text-[8px] text-indigo-500 font-bold mt-0.5">📄 Generated in your school's exam style</p>
              </div>
            </div>

            <!-- Trend -->
            <div v-if="mockTrend" :class="['rounded-2xl p-4 flex items-center gap-3', mockTrend.up ? 'bg-emerald-50 border border-emerald-100' : 'bg-rose-50 border border-rose-100']">
              <span class="text-2xl">{{ mockTrend.up ? '📈' : '📉' }}</span>
              <div>
                <p class="text-[11px] font-black" :class="mockTrend.up ? 'text-emerald-700' : 'text-rose-700'">
                  {{ mockTrend.up ? 'Improving' : 'Needs attention' }} — {{ mockTrend.label }} from previous mock
                </p>
                <p class="text-[8px] font-bold" :class="mockTrend.up ? 'text-emerald-500' : 'text-rose-500'">
                  {{ mockTrend.up ? 'Great progress! Keep consistent revision going.' : 'More practice sessions recommended before next attempt.' }}
                </p>
              </div>
            </div>

            <!-- All mock history -->
            <div class="space-y-2">
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">All Attempts</p>
              <div v-for="paper in markedPapers" :key="paper.id" class="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                <div :class="['w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black border flex-shrink-0', mockGradeColor(mockPaperScore(paper).pct)]">
                  {{ mockGrade(mockPaperScore(paper).pct) }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[10px] font-black text-slate-700 truncate">{{ paper.title }}</p>
                  <p class="text-[8px] text-slate-400 font-bold">{{ mockPaperScore(paper).pct }}% · {{ (paper.topicsCovered || []).length }} topics</p>
                </div>
                <span class="text-[8px] text-slate-400 font-bold flex-shrink-0">
                  {{ paper.markedAt ? new Date(paper.markedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—' }}
                </span>
              </div>
            </div>

            <!-- Weak topics from mocks -->
            <div v-if="mockWeakTopics.length" class="bg-rose-50 border border-rose-100 rounded-2xl p-4">
              <p class="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-2">Topics scoring below 70% in exams</p>
              <div class="space-y-1.5">
                <div v-for="t in mockWeakTopics" :key="t.topic" class="flex items-center justify-between">
                  <p class="text-[10px] font-bold text-slate-700">{{ t.topic }}</p>
                  <span :class="['text-[9px] font-black px-2 py-0.5 rounded-full', t.pct < 50 ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600']">{{ t.pct }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Practice overview -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p class="text-2xl font-black text-slate-800">{{ totalCompleted }}<span class="text-sm text-slate-400">/{{ topicHeatmap.length }}</span></p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Topics Mastered</p>
            <div class="h-1.5 bg-slate-100 rounded-full mt-2">
              <div class="h-full bg-indigo-500 rounded-full" :style="{ width: (topicHeatmap.length ? totalCompleted / topicHeatmap.length * 100 : 0) + '%' }"></div>
            </div>
          </div>
          <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p class="text-2xl font-black text-slate-800">{{ overallAccuracy }}%</p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Practice Accuracy</p>
            <p class="text-[9px] text-slate-500 mt-1 font-bold">{{ totalQuestions }} questions</p>
          </div>
          <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p class="text-2xl font-black text-slate-800">{{ student.streak }}</p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Day Streak 🔥</p>
          </div>
          <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p class="text-2xl font-black text-slate-800">{{ markedPapers.length }}</p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Mocks Completed</p>
          </div>
        </div>

        <!-- Skill profile -->
        <div class="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <h3 class="text-sm font-black text-slate-800 mb-4">Skill Profile</h3>
          <div v-if="!totalQuestions" class="text-center py-4">
            <p class="text-[10px] text-slate-300 font-bold">Needs more practice sessions to generate skill data.</p>
          </div>
          <div v-else class="space-y-4">
            <div v-for="skill in computedSkills" :key="skill.label">
              <div class="flex justify-between text-[10px] font-black mb-1">
                <span class="text-slate-600">{{ skill.icon }} {{ skill.label }}</span>
                <span :class="skill.val >= 70 ? 'text-emerald-600' : skill.val >= 40 ? 'text-amber-500' : 'text-rose-500'">
                  {{ skill.val >= 70 ? 'Strong' : skill.val >= 40 ? 'Developing' : skill.val > 0 ? 'Needs Work' : 'No data' }}
                </span>
              </div>
              <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-1000"
                  :class="skill.val >= 70 ? 'bg-emerald-400' : skill.val >= 40 ? 'bg-amber-400' : 'bg-rose-400'"
                  :style="{ width: skill.val + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Topic attention areas -->
        <div v-if="weakTopics.length" class="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <h3 class="text-sm font-black text-slate-800 mb-1">Topics Needing Attention</h3>
          <p class="text-[9px] text-slate-400 font-bold mb-4">Scoring below 50% in practice sessions</p>
          <div class="space-y-2">
            <div v-for="t in weakTopics" :key="t.id" class="flex items-center gap-3 p-3 bg-rose-50 rounded-2xl">
              <span class="text-lg">⚠️</span>
              <div class="flex-1">
                <p class="text-[11px] font-black text-slate-800">{{ t.name }}</p>
                <p class="text-[8px] text-rose-500 font-bold uppercase tracking-widest">{{ t.subject }} · {{ t.score }}% mastery</p>
              </div>
            </div>
          </div>
        </div>

        <button @click="exportFullDatabase" :disabled="isExporting"
          class="w-full py-3 bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all disabled:opacity-50">
          {{ isExporting ? 'Exporting...' : '⬇ Export Full Report' }}
        </button>
      </template>
    </template>

  </div>
</template>