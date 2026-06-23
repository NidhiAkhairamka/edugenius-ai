<script setup>
/**
 * StudyPlan.vue — turns CONFIRMED diagnostic gaps into a structured 3-week plan.
 *
 * Pipeline: skill map -> confirmed gaps (confidence < 45, evidence-based only)
 *   -> map each gap node to a topic in the 58-topic CURRICULUM bank
 *   -> distribute by priority across Week 1/2/3 -> render sessions.
 *
 * Only confirmed gaps drive the plan — nothing assumed. If the child hasn't
 * taken the diagnostic, we send them there first.
 */
import { ref, computed, onMounted } from 'vue';
import { db } from '../services/dbService';
import { CURRICULUM } from '../constants';
import { nodeName, topicForNode } from '../services/skillGraph';

const props = defineProps(['student']);
const emit = defineEmits(['back', 'startTopic', 'takeDiagnostic']);

const loading = ref(true);
const skillMap = ref(null);

onMounted(async () => {
  loading.value = true;
  skillMap.value = await db.getSkillMap(props.student?.name || '');
  loading.value = false;
});

const tested = computed(() => skillMap.value?.summary?.totalTested || 0);

// Confirmed gaps, worst first
const gaps = computed(() => {
  const nodes = skillMap.value?.nodes || {};
  return Object.entries(nodes)
    .filter(([, v]) => v.confidence < 45)
    .sort((a, b) => a[1].confidence - b[1].confidence)
    .map(([id, v]) => ({ id, ...v }));
});

function topicFor(nodeId) {
  const tid = topicForNode(nodeId);
  return tid ? CURRICULUM.find(t => t.id === tid) : null;
}

// Build sessions (one per gap, deduped by topic — keep highest-priority node)
const sessions = computed(() => {
  const seen = new Set();
  const out = [];
  gaps.value.forEach((g, i) => {
    const topic = topicFor(g.id);
    if (!topic) return;
    if (seen.has(topic.id)) {
      // attach this node to the existing session
      const s = out.find(x => x.topic.id === topic.id);
      if (s) s.nodes.push(g.id);
      return;
    }
    seen.add(topic.id);
    out.push({ priority: i + 1, topic, nodes: [g.id], evidence: g.evidence, confidence: g.confidence });
  });
  return out;
});

// Distribute across 3 weeks (priority order, balanced)
const weeks = computed(() => {
  const s = sessions.value;
  if (s.length === 0) return [];
  const perWeek = Math.ceil(s.length / 3);
  const w = [[], [], []];
  s.forEach((sess, i) => { w[Math.min(2, Math.floor(i / perWeek))].push(sess); });
  return w
    .map((items, i) => ({ week: i + 1, items }))
    .filter(wk => wk.items.length > 0);
});

const WEEK_FOCUS = ['Fix the foundations', 'Build on what\'s fixed', 'Consolidate & stretch'];

async function savePlan() {
  if (!props.student) return;
  const plan = {
    generatedAt: new Date().toISOString(),
    weeks: weeks.value.map(w => ({
      week: w.week,
      items: w.items.map(it => ({ topicId: it.topic.id, topicName: it.topic.name, nodes: it.nodes })),
    })),
  };
  props.student.studyPlan = plan;
  try { await db.saveProfile(props.student); } catch (e) { /* non-blocking */ }
}
// Persist whenever a usable plan exists
onMounted(() => { setTimeout(() => { if (sessions.value.length) savePlan(); }, 1500); });
</script>

<template>
  <div class="pb-6">
    <div class="flex items-center gap-3 mb-4">
      <button @click="emit('back')" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">←</button>
      <div class="flex-1">
        <h1 class="text-base font-black text-slate-900">Study Plan</h1>
        <p class="text-[11px] text-slate-400">Built from confirmed gaps · {{ student?.displayName || student?.name }}</p>
      </div>
    </div>

    <div v-if="loading" class="flex flex-col items-center py-16 text-slate-400">
      <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
      Building your plan…
    </div>

    <!-- No diagnostic yet -->
    <div v-else-if="tested === 0" class="bg-white border border-slate-200 rounded-2xl p-8 text-center">
      <div class="text-4xl mb-3">🧭</div>
      <h2 class="text-lg font-bold text-slate-900 mb-1">Take the diagnostic first</h2>
      <p class="text-xs text-slate-500 mb-5 leading-relaxed">A study plan is only as good as the evidence behind it. The 20-question diagnostic confirms exactly where to focus — no guessing.</p>
      <button @click="emit('takeDiagnostic')" class="btn-primary">Take the diagnostic (20 min)</button>
    </div>

    <!-- No gaps -->
    <div v-else-if="sessions.length === 0" class="bg-white border border-slate-200 rounded-2xl p-8 text-center">
      <div class="text-4xl mb-3">🏆</div>
      <h2 class="text-lg font-bold text-slate-900 mb-1">No confirmed gaps</h2>
      <p class="text-xs text-slate-500 mb-5 leading-relaxed">Every tested topic came back strong. Take a wider diagnostic to probe harder levels, or keep practising to maintain mastery.</p>
      <button @click="emit('takeDiagnostic')" class="btn-primary">Test harder topics</button>
    </div>

    <!-- Plan -->
    <div v-else class="space-y-5">
      <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-lg">🎯</span>
          <h2 class="text-sm font-bold text-indigo-900">{{ sessions.length }} focus {{ sessions.length === 1 ? 'area' : 'areas' }} over {{ weeks.length }} {{ weeks.length === 1 ? 'week' : 'weeks' }}</h2>
        </div>
        <p class="text-[11px] text-indigo-700 leading-relaxed">Ordered by priority — the most confirmed gaps come first, because fixing them unlocks everything built on top.</p>
      </div>

      <div v-for="wk in weeks" :key="wk.week" class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div class="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <span class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black">{{ wk.week }}</span>
          <div>
            <div class="text-sm font-bold text-slate-900">Week {{ wk.week }}</div>
            <div class="text-[10px] text-slate-400 uppercase tracking-widest">{{ WEEK_FOCUS[wk.week - 1] }}</div>
          </div>
        </div>
        <div class="divide-y divide-slate-50">
          <div v-for="(s, i) in wk.items" :key="s.topic.id" class="p-4">
            <div class="flex items-start gap-3">
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 mt-0.5 bg-red-100 text-red-700">#{{ s.priority }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-bold text-slate-900">{{ s.topic.name }}</div>
                <div class="text-[11px] text-slate-400 mb-1">Year {{ s.topic.year }} · {{ s.topic.description }}</div>
                <div class="flex flex-wrap gap-1 mb-2">
                  <span v-for="nid in s.nodes" :key="nid" class="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">{{ nodeName(nid) }}</span>
                </div>
                <p v-if="s.evidence" class="text-[11px] text-slate-500 italic mb-2">{{ s.evidence }}</p>
                <button @click="emit('startTopic', s.topic)" class="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700">Start session →</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-3 text-[11px] text-slate-500 leading-relaxed">
        💡 Plan rebuilds automatically as new diagnostics confirm progress. Retake the diagnostic after Week 3 to see gaps close.
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-primary { padding:0.7rem 1.5rem; background:#4f46e5; color:white; border-radius:1rem; font-weight:800; font-size:0.85rem; }
.btn-primary:hover { background:#4338ca; }
</style>
