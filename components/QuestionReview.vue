<script setup>
/**
 * QuestionReview.vue — Admin review queue for diagnostic questions.
 *
 * Draft questions live in the `diagnostic_questions` table (seeded from
 * data/diagnostic_review.json). This screen lets the reviewer:
 *   - read each question, answer key, explanation and distractor notes
 *   - edit the correct answer / question text inline
 *   - mark a question "reviewed", then "approve" it
 * Only approved questions are served to the live diagnostic
 * (GET /api/diagnostic/questions/approved).
 */
import { ref, computed, onMounted } from 'vue';
import { db } from '../services/dbService';

const emit = defineEmits(['back']);

const loading = ref(true);
const saving = ref({});          // id -> bool
const questions = ref([]);
const filterSection = ref('All');
const filterStatus = ref('All'); // All | Pending | Reviewed | Approved
const expanded = ref(null);      // id of the open editor

const SECTIONS = ['All', 'Number', 'Algebra', 'Geometry', 'Statistics'];
const STATUSES = ['All', 'Pending', 'Reviewed', 'Approved'];

async function load() {
  loading.value = true;
  const res = await db.getReviewQuestions();
  questions.value = res?.questions || [];
  loading.value = false;
}
onMounted(load);

const reviewedCount = computed(() => questions.value.filter(q => q.reviewed).length);
const approvedCount = computed(() => questions.value.filter(q => q.approved).length);
const pct = computed(() => questions.value.length
  ? Math.round(approvedCount.value / questions.value.length * 100) : 0);

const filtered = computed(() => questions.value.filter(q => {
  if (filterSection.value !== 'All' && q.section !== filterSection.value) return false;
  if (filterStatus.value === 'Pending'  && q.reviewed) return false;
  if (filterStatus.value === 'Reviewed' && !(q.reviewed && !q.approved)) return false;
  if (filterStatus.value === 'Approved' && !q.approved) return false;
  return true;
}));

function statusLabel(q) {
  if (q.approved) return { text: 'Approved', cls: 'bg-green-100 text-green-700' };
  if (q.reviewed) return { text: 'Reviewed', cls: 'bg-amber-100 text-amber-700' };
  return { text: 'Pending', cls: 'bg-slate-100 text-slate-500' };
}

async function patch(q, payload) {
  saving.value = { ...saving.value, [q.id]: true };
  const res = await db.updateReviewQuestion({ id: q.id, ...payload });
  if (res) {
    q.reviewed = res.reviewed;
    q.approved = res.approved;
    if (payload.question) Object.assign(q, payload.question);
  }
  saving.value = { ...saving.value, [q.id]: false };
}

function toggleReviewed(q) { patch(q, { reviewed: !q.reviewed }); }
function approve(q)        { patch(q, { approved: true }); }
function unapprove(q)      { patch(q, { approved: false }); }

function saveEdit(q) {
  const edit = { text: q._editText, explanation: q._editExpl };
  if (q.type === 'mcq') edit.correctIndex = Number(q._editAnswer);
  else edit.correctAnswer = q._editAnswer;
  patch(q, { question: edit, reviewed: true });
  expanded.value = null;
}

function openEditor(q) {
  q._editText = q.text;
  q._editExpl = q.explanation;
  q._editAnswer = q.type === 'mcq' ? String(q.correctIndex ?? 0) : String(q.correctAnswer ?? '');
  expanded.value = expanded.value === q.id ? null : q.id;
}

function answerDisplay(q) {
  if (q.type === 'mcq') return q.options?.[q.correctIndex] ?? `index ${q.correctIndex}`;
  return q.correctAnswer;
}
</script>

<template>
  <div class="pb-6">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-4">
      <button @click="emit('back')" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">←</button>
      <div class="flex-1">
        <h1 class="text-base font-black text-slate-900">Question Review</h1>
        <p class="text-[11px] text-slate-400">Approve diagnostic questions before they go live</p>
      </div>
    </div>

    <!-- Progress -->
    <div class="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
      <div class="flex justify-between items-end mb-2">
        <div>
          <div class="text-2xl font-black text-slate-900">{{ approvedCount }}<span class="text-slate-300">/{{ questions.length }}</span></div>
          <div class="text-[11px] text-slate-400">approved · {{ reviewedCount }} reviewed</div>
        </div>
        <div class="text-right text-xs text-indigo-600 font-bold">{{ pct }}%</div>
      </div>
      <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full bg-green-500 rounded-full transition-all" :style="{ width: pct + '%' }"></div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-1.5 mb-3">
      <button v-for="s in SECTIONS" :key="s" @click="filterSection = s"
        :class="['text-[11px] px-2.5 py-1 rounded-full font-semibold', filterSection===s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500']">{{ s }}</button>
    </div>
    <div class="flex flex-wrap gap-1.5 mb-4">
      <button v-for="s in STATUSES" :key="s" @click="filterStatus = s"
        :class="['text-[11px] px-2.5 py-1 rounded-full font-semibold border', filterStatus===s ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-400']">{{ s }}</button>
    </div>

    <div v-if="loading" class="flex flex-col items-center py-16 text-slate-400">
      <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
      Loading questions…
    </div>

    <div v-else-if="filtered.length === 0" class="text-center text-sm text-slate-400 py-12">No questions match this filter.</div>

    <!-- Question list -->
    <div v-else class="space-y-3">
      <div v-for="q in filtered" :key="q.id" class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div class="p-4">
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-500">{{ q.id }}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{{ q.section }} · L{{ q.level }}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-500">{{ q.type }}</span>
            <span :class="['text-[10px] px-2 py-0.5 rounded-full font-bold ml-auto', statusLabel(q).cls]">{{ statusLabel(q).text }}</span>
          </div>

          <p class="text-sm font-semibold text-slate-900 leading-snug mb-2" v-html="q.text"></p>

          <div v-if="q.type === 'mcq'" class="flex flex-wrap gap-1.5 mb-2">
            <span v-for="(opt,i) in q.options" :key="i"
              :class="['text-[11px] px-2 py-0.5 rounded border', i===q.correctIndex ? 'border-green-400 bg-green-50 text-green-800 font-bold' : 'border-slate-200 text-slate-500']">
              {{ ['A','B','C','D'][i] }}. {{ opt }}
            </span>
          </div>

          <div class="text-xs text-slate-500 mb-1"><span class="font-semibold text-slate-700">Answer:</span> {{ answerDisplay(q) }}</div>
          <div class="text-[11px] text-slate-400 leading-snug mb-1">{{ q.explanation }}</div>
          <div v-if="q.distractor_notes" class="text-[11px] text-amber-700/80 bg-amber-50 rounded-lg px-2 py-1 mt-1">⚠ {{ q.distractor_notes }}</div>

          <!-- Actions -->
          <div class="flex flex-wrap gap-2 mt-3">
            <button @click="openEditor(q)" class="text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold">{{ expanded===q.id ? 'Close' : 'Edit' }}</button>
            <button @click="toggleReviewed(q)" :disabled="saving[q.id]"
              :class="['text-[11px] px-3 py-1.5 rounded-lg font-semibold', q.reviewed ? 'bg-amber-100 text-amber-700' : 'border border-slate-200 text-slate-600 hover:bg-slate-50']">
              {{ q.reviewed ? '✓ Reviewed' : 'Mark reviewed' }}
            </button>
            <button v-if="!q.approved" @click="approve(q)" :disabled="saving[q.id]" class="text-[11px] px-3 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-40">Approve</button>
            <button v-else @click="unapprove(q)" :disabled="saving[q.id]" class="text-[11px] px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 font-semibold">✓ Approved — undo</button>
          </div>
        </div>

        <!-- Inline editor -->
        <div v-if="expanded===q.id" class="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Question text (HTML allowed)</label>
            <textarea v-model="q._editText" rows="2" class="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"></textarea>
          </div>
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
              {{ q.type === 'mcq' ? 'Correct option index (0=A, 1=B…)' : 'Correct answer' }}
            </label>
            <input v-model="q._editAnswer" type="text" class="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Explanation</label>
            <textarea v-model="q._editExpl" rows="2" class="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"></textarea>
          </div>
          <button @click="saveEdit(q)" :disabled="saving[q.id]" class="text-[11px] px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-40">Save changes &amp; mark reviewed</button>
        </div>
      </div>
    </div>
  </div>
</template>
