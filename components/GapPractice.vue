<script setup>
/**
 * GapPractice.vue — focused drill on ONE confirmed-gap skill node.
 *
 * Questions come from the Tier-1 template engine (code-generated, code-verified),
 * marked deterministically — no AI, no stored key. Mastery = 5 correct in a row.
 * On mastery the streak is saved as confirmed diagnostic evidence, so the skill
 * map flips the node from red → green: the kid SEES the gap close.
 */
import { ref, computed, onMounted } from 'vue';
import { generate, mark, hasTemplate } from '../services/practiceEngine';
import { nodeName } from '../services/skillGraph';
import { db } from '../services/dbService';

const props = defineProps(['student', 'node', 'topic']);
const emit = defineEmits(['back', 'mastered', 'learnTopic']);

const TARGET = 5;
const supported = ref(true);
const q = ref(null);
const answer = ref('');
const selected = ref(null);
const checked = ref(false);
const wasCorrect = ref(false);
const streak = ref(0);
const totalDone = ref(0);
const mastered = ref(false);
const streakQs = ref([]); // questions answered correctly in the current streak

const sessionId = `practice-${props.node}-${Date.now()}`;

onMounted(() => {
  supported.value = hasTemplate(props.node);
  if (supported.value) nextQ();
});

function nextQ() {
  checked.value = false; wasCorrect.value = false; answer.value = ''; selected.value = null;
  q.value = generate(props.node);
}

function check() {
  if (checked.value || !q.value) return;
  const given = q.value.type === 'mcq' ? selected.value : answer.value;
  if (given === null || given === '') return;
  const ok = mark(q.value, given);
  checked.value = true; wasCorrect.value = ok; totalDone.value++;

  if (ok) {
    streak.value++;
    streakQs.value.push(q.value);
    if (streak.value >= TARGET) confirmMastery();
  } else {
    streak.value = 0;
    streakQs.value = [];
  }
}

async function confirmMastery() {
  mastered.value = true;
  // Save the winning streak as confirmed evidence so the skill map updates.
  try {
    await Promise.all(streakQs.value.map((sq, i) =>
      db.saveDiagnosticResult({
        studentName: props.student?.name || 'Unknown',
        sessionId,
        questionId: `${sessionId}-${i}`,
        skillNode: props.node,
        skillLevel: 5,
        section: props.topic?.subject === 'Science' ? 'Science' : 'Practice',
        isCorrect: true,
        studentAnswer: '', correctAnswer: String(sq.correctAnswer),
        evidence: `Mastery: ${TARGET} correct in a row in practice`,
      })
    ));
  } catch (e) { /* non-blocking */ }
}

const progressPct = computed(() => Math.round((streak.value / TARGET) * 100));
</script>

<template>
  <div class="pb-6">
    <div class="flex items-center gap-3 mb-4">
      <button @click="emit('back')" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">←</button>
      <div class="flex-1">
        <h1 class="text-base font-black text-slate-900">{{ nodeName(node) }}</h1>
        <p class="text-[11px] text-slate-400">Practice to mastery · {{ student?.displayName || student?.name }}</p>
      </div>
    </div>

    <!-- No template -->
    <div v-if="!supported" class="bg-white border border-slate-200 rounded-2xl p-8 text-center">
      <div class="text-4xl mb-3">📚</div>
      <h2 class="text-lg font-bold text-slate-900 mb-1">Learn this topic first</h2>
      <p class="text-xs text-slate-500 mb-5 leading-relaxed">This skill is best learned with a full lesson and worked examples before drilling.</p>
      <button v-if="topic" @click="emit('learnTopic', topic)" class="btn-primary">Open the lesson →</button>
    </div>

    <!-- Mastered -->
    <div v-else-if="mastered" class="bg-white border border-green-200 rounded-2xl p-8 text-center">
      <div class="text-5xl mb-3">🎉</div>
      <h2 class="text-xl font-black text-slate-900 mb-1">Gap closed!</h2>
      <p class="text-sm text-slate-500 mb-1">{{ TARGET }} correct in a row on <b>{{ nodeName(node) }}</b>.</p>
      <p class="text-xs text-slate-400 mb-6">This is now confirmed on your skill map — watch it turn green.</p>
      <div class="flex gap-3">
        <button @click="emit('back')" class="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50">Back to plan</button>
        <button @click="emit('mastered', node)" class="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700">See skill map →</button>
      </div>
    </div>

    <!-- Practice -->
    <div v-else-if="q" class="space-y-4">
      <!-- Mastery streak bar -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-slate-600">{{ streak }} / {{ TARGET }} in a row</span>
          <span class="text-[11px] text-slate-400">{{ totalDone }} answered</span>
        </div>
        <div class="flex gap-1.5">
          <div v-for="i in TARGET" :key="i"
            :class="['flex-1 h-2.5 rounded-full transition-all', i <= streak ? 'bg-green-500' : 'bg-slate-100']"></div>
        </div>
        <p class="text-[11px] text-slate-400 mt-2">Get {{ TARGET }} right in a row to close this gap. A wrong answer resets the streak — focus!</p>
      </div>

      <!-- Question -->
      <div class="bg-white border border-slate-200 rounded-2xl p-6">
        <p class="text-base font-semibold text-slate-900 leading-relaxed mb-5" v-html="q.text"></p>

        <div v-if="q.type === 'mcq'" class="space-y-2.5">
          <button v-for="(opt, i) in q.options" :key="i" @click="!checked && (selected = i)" :disabled="checked"
            :class="['w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all',
              checked && i === q.correctAnswer ? 'bg-green-50 border-green-400 text-green-800' :
              checked && i === selected && !wasCorrect ? 'bg-red-50 border-red-400 text-red-800' :
              selected === i ? 'bg-indigo-50 border-indigo-400 text-indigo-800' :
              'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300']">
            {{ opt }}
          </button>
        </div>
        <div v-else>
          <input v-model="answer" :disabled="checked" @keydown.enter="check" type="text" inputmode="decimal"
            :placeholder="q.inputHint || 'Type your answer'"
            :class="['w-full border rounded-xl px-4 py-3 text-base font-semibold outline-none transition-colors',
              checked && wasCorrect ? 'border-green-400 bg-green-50 text-green-800' :
              checked && !wasCorrect ? 'border-red-400 bg-red-50 text-red-800' :
              'border-slate-200 focus:border-indigo-400 bg-slate-50']" />
        </div>

        <div v-if="checked" :class="['mt-4 rounded-xl p-4 text-sm flex gap-3', wasCorrect ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200']">
          <span class="text-xl flex-shrink-0">{{ wasCorrect ? '✅' : '💡' }}</span>
          <div>
            <p class="font-semibold mb-1" :class="wasCorrect ? 'text-green-800' : 'text-orange-800'">
              {{ wasCorrect ? 'Correct!' : 'Not quite — answer: ' + q.correctAnswer }}
            </p>
            <p class="text-xs text-slate-600 leading-relaxed">{{ q.explanation }}</p>
          </div>
        </div>
      </div>

      <button v-if="!checked" @click="check" :disabled="q.type === 'mcq' ? selected === null : !answer.trim()"
        class="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-40">Check answer</button>
      <button v-else @click="nextQ" class="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700">Next question →</button>
    </div>
  </div>
</template>

<style scoped>
.btn-primary { padding:0.7rem 1.5rem; background:#4f46e5; color:white; border-radius:1rem; font-weight:800; font-size:0.85rem; }
.btn-primary:hover { background:#4338ca; }
</style>
