<script setup>
/**
 * QuestionQualityPanel.vue
 *
 * A developer/admin view for monitoring question generation quality.
 * Shows pass rates, failure reasons, topic match scores, fallback usage.
 *
 * How to add to your app:
 *   1. Import and register in App.vue
 *   2. Add a nav item for 'quality' (e.g. only visible in dev mode)
 *   3. <QuestionQualityPanel v-if="view === 'quality'" @back="view = 'dashboard'" />
 *
 * OR: Add a hidden trigger in Statistics.vue parent view (e.g. tap the title 5 times).
 */

import { ref, computed, onMounted } from 'vue';
import { getQualityLogs, computeQualityStats, clearQualityLogs } from '../services/questionManager';

const emit = defineEmits(['back']);

const logs = ref([]);
const showClearConfirm = ref(false);
const activeTab = ref('overview'); // 'overview' | 'log' | 'failures'

onMounted(() => {
  logs.value = getQualityLogs();
});

const stats = computed(() => computeQualityStats(logs.value));

const recentLogs = computed(() => logs.value.slice(0, 50));
const failureLogs = computed(() => logs.value.filter(l => !l.validationResult.passed || l.usedFallback));

const handleClear = () => {
  clearQualityLogs();
  logs.value = [];
  showClearConfirm.value = false;
};

const refresh = () => {
  logs.value = getQualityLogs();
};

// Colour helpers
const passRateColor = computed(() => {
  const r = stats.value.passRate;
  if (r >= 85) return 'text-emerald-600';
  if (r >= 65) return 'text-amber-500';
  return 'text-rose-500';
});

const scoreColor = (score) => {
  if (score >= 8) return 'text-emerald-600 bg-emerald-50';
  if (score >= 6) return 'text-amber-600 bg-amber-50';
  return 'text-rose-600 bg-rose-50';
};

const layerBadge = (log) => {
  if (log.usedFallback) return { label: '🆘 Fallback', cls: 'bg-rose-100 text-rose-700' };
  if (!log.validationResult.passed) {
    if (log.validationResult.layer === 'schema') return { label: '❌ Schema', cls: 'bg-orange-100 text-orange-700' };
    return { label: '⚠️ Relevance', cls: 'bg-amber-100 text-amber-700' };
  }
  if (log.validationResult.attempts > 1) return { label: `✅ Pass (retry ${log.validationResult.attempts})`, cls: 'bg-blue-100 text-blue-700' };
  return { label: '✅ Pass', cls: 'bg-emerald-100 text-emerald-700' };
};

const formatTime = (iso) => {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const exportLog = () => {
  const data = JSON.stringify(logs.value, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edugenius_quality_log_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <div class="pb-32 space-y-4">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          🔬 Quality Monitor
        </h2>
        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Question validation pipeline</p>
      </div>
      <div class="flex gap-2">
        <button @click="refresh" class="px-3 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-100 transition-all">↻ Refresh</button>
        <button @click="emit('back')" class="px-3 py-2 bg-white border-2 border-slate-100 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-50 transition-all">← Back</button>
      </div>
    </div>

    <!-- No data state -->
    <div v-if="!logs.length" class="bg-white rounded-3xl p-12 border border-slate-100 shadow-sm text-center">
      <p class="text-4xl mb-3">📭</p>
      <h3 class="text-sm font-black text-slate-600 mb-1">No quality data yet</h3>
      <p class="text-[10px] text-slate-400 font-bold">Generate some questions in the Learning Arena to start collecting quality metrics.</p>
    </div>

    <template v-else>

      <!-- Tab bar -->
      <div class="bg-slate-100 p-1 rounded-2xl flex gap-1">
        <button v-for="t in [['overview', '📊 Overview'], ['log', '📋 Full Log'], ['failures', '❌ Failures']]" :key="t[0]"
          @click="activeTab = t[0]"
          :class="['flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all', activeTab === t[0] ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400']"
        >{{ t[1] }}</button>
      </div>

      <!-- ══════════ OVERVIEW TAB ══════════ -->
      <template v-if="activeTab === 'overview'">

        <!-- Key Metrics Row -->
        <div class="grid grid-cols-2 gap-3">

          <!-- Pass Rate -->
          <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm text-center col-span-2">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Overall Pass Rate</p>
            <p class="text-5xl font-black" :class="passRateColor">{{ stats.passRate }}%</p>
            <p class="text-[9px] text-slate-400 font-bold mt-1">{{ stats.totalGenerated }} questions evaluated</p>
            <!-- Pass rate bar -->
            <div class="h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-1000"
                :class="stats.passRate >= 85 ? 'bg-emerald-400' : stats.passRate >= 65 ? 'bg-amber-400' : 'bg-rose-400'"
                :style="{ width: stats.passRate + '%' }">
              </div>
            </div>
            <p class="text-[8px] text-slate-300 font-bold mt-1">Target: ≥ 85%</p>
          </div>

          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
            <span class="text-2xl block mb-1">✅</span>
            <p class="text-xl font-black text-slate-800">{{ stats.passedFirstTry }}</p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">First Try</p>
          </div>

          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
            <span class="text-2xl block mb-1">🔁</span>
            <p class="text-xl font-black text-slate-800">{{ stats.passedAfterRetry }}</p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">After Retry</p>
          </div>

          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
            <span class="text-2xl block mb-1">🆘</span>
            <p class="text-xl font-black" :class="stats.usedFallback > 0 ? 'text-rose-500' : 'text-slate-800'">{{ stats.usedFallback }}</p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fallbacks Used</p>
          </div>

          <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
            <span class="text-2xl block mb-1">🎯</span>
            <p class="text-xl font-black text-slate-800">{{ stats.avgTopicMatchScore }}<span class="text-sm text-slate-400">/10</span></p>
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Avg Topic Score</p>
          </div>
        </div>

        <!-- Failure Breakdown -->
        <div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <h3 class="text-sm font-black text-slate-800 mb-3">Failure Breakdown</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-orange-400"></div>
                <span class="text-[10px] font-bold text-slate-600">Schema failures</span>
              </div>
              <span class="font-black text-sm text-slate-800">{{ stats.schemaFailures }}</span>
            </div>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-amber-400"></div>
                <span class="text-[10px] font-bold text-slate-600">Relevance failures</span>
              </div>
              <span class="font-black text-sm text-slate-800">{{ stats.relevanceFailures }}</span>
            </div>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-rose-400"></div>
                <span class="text-[10px] font-bold text-slate-600">Fallback triggered</span>
              </div>
              <span class="font-black text-sm text-slate-800">{{ stats.usedFallback }}</span>
            </div>
          </div>
        </div>

        <!-- Top Failure Reasons -->
        <div v-if="stats.topFailureReasons.length" class="bg-slate-900 rounded-3xl p-5 text-white">
          <h3 class="text-sm font-black mb-3">Top Failure Reasons</h3>
          <div class="space-y-2">
            <div v-for="(item, i) in stats.topFailureReasons" :key="i" class="flex items-start justify-between gap-3">
              <p class="text-[10px] font-bold text-slate-300 flex-1">{{ item.reason }}</p>
              <span class="text-[9px] font-black text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded-full flex-shrink-0">×{{ item.count }}</span>
            </div>
          </div>
        </div>

        <!-- Difficulty Distribution -->
        <div v-if="Object.keys(stats.difficultyDistribution).length" class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <h3 class="text-sm font-black text-slate-800 mb-3">Difficulty Distribution</h3>
          <div class="space-y-2">
            <div v-for="(count, diff) in stats.difficultyDistribution" :key="diff">
              <div class="flex justify-between text-[10px] font-bold mb-1">
                <span class="text-slate-600">{{ diff }}</span>
                <span class="text-slate-400">{{ count }} ({{ Math.round(count / stats.totalGenerated * 100) }}%)</span>
              </div>
              <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full bg-indigo-400 rounded-full" :style="{ width: (count / stats.totalGenerated * 100) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button @click="exportLog" class="flex-1 py-3 bg-slate-800 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-700 transition-all">
            ⬇ Export Log
          </button>
          <button @click="showClearConfirm = true" class="flex-1 py-3 bg-rose-50 text-rose-500 border border-rose-100 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-100 transition-all">
            🗑 Clear Data
          </button>
        </div>

        <!-- Clear Confirm -->
        <div v-if="showClearConfirm" class="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 space-y-3">
          <p class="text-sm font-black text-rose-700 text-center">Clear all quality data?</p>
          <p class="text-[9px] text-rose-500 font-bold text-center">This cannot be undone.</p>
          <div class="flex gap-3">
            <button @click="showClearConfirm = false" class="flex-1 py-2 bg-white border border-slate-200 rounded-xl font-black text-[9px] uppercase tracking-widest">Cancel</button>
            <button @click="handleClear" class="flex-1 py-2 bg-rose-500 text-white rounded-xl font-black text-[9px] uppercase tracking-widest">Confirm Clear</button>
          </div>
        </div>
      </template>

      <!-- ══════════ FULL LOG TAB ══════════ -->
      <template v-if="activeTab === 'log'">
        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Showing last {{ recentLogs.length }} of {{ logs.length }} entries</p>
        <div class="space-y-2">
          <div v-for="log in recentLogs" :key="log.timestamp" class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[8px] font-black px-2 py-0.5 rounded-full" :class="layerBadge(log).cls">{{ layerBadge(log).label }}</span>
                  <span class="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{{ log.subject }} · {{ log.difficulty }} · Y{{ log.yearLevel }}</span>
                </div>
                <p class="text-[10px] font-black text-slate-700 mt-1 leading-tight">{{ log.topicName }}</p>
              </div>
              <div v-if="log.validationResult.topicMatchScore" :class="['text-[9px] font-black px-2 py-1 rounded-xl flex-shrink-0', scoreColor(log.validationResult.topicMatchScore)]">
                {{ log.validationResult.topicMatchScore }}/10
              </div>
            </div>
            <p class="text-[9px] text-slate-500 font-medium line-clamp-2 border-t border-slate-50 pt-2">{{ log.questionText }}</p>
            <p class="text-[7px] text-slate-300 font-bold mt-1">{{ formatTime(log.timestamp) }}</p>
          </div>
        </div>
      </template>

      <!-- ══════════ FAILURES TAB ══════════ -->
      <template v-if="activeTab === 'failures'">
        <div v-if="!failureLogs.length" class="bg-emerald-50 rounded-3xl p-10 text-center border border-emerald-100">
          <p class="text-3xl mb-2">🎉</p>
          <p class="text-sm font-black text-emerald-700">No failures recorded!</p>
          <p class="text-[10px] text-emerald-500 font-bold mt-1">All questions passed validation.</p>
        </div>
        <div v-else class="space-y-2">
          <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{{ failureLogs.length }} failure events</p>
          <div v-for="log in failureLogs" :key="log.timestamp" class="bg-white rounded-2xl p-4 border-2 border-rose-100 shadow-sm">
            <div class="flex items-center gap-1.5 mb-2 flex-wrap">
              <span class="text-[8px] font-black px-2 py-0.5 rounded-full" :class="layerBadge(log).cls">{{ layerBadge(log).label }}</span>
              <span class="text-[7px] font-bold text-slate-400">{{ log.topicName }} · {{ log.subject }} · Y{{ log.yearLevel }}</span>
            </div>
            <p class="text-[9px] text-slate-600 font-medium line-clamp-2 mb-2">{{ log.questionText }}</p>
            <div class="bg-rose-50 rounded-xl p-3 space-y-1">
              <p class="text-[8px] font-black text-rose-600 uppercase tracking-widest">Failure reasons:</p>
              <p v-for="reason in log.validationResult.reasons" :key="reason" class="text-[9px] font-bold text-rose-700">• {{ reason }}</p>
            </div>
            <p class="text-[7px] text-slate-300 font-bold mt-2">Attempt {{ log.validationResult.attempts }} of 3 · {{ formatTime(log.timestamp) }}</p>
          </div>
        </div>
      </template>

    </template>
  </div>
</template>