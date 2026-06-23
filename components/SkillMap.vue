<script setup>
import { ref, computed, onMounted } from 'vue';
import { db } from '../services/dbService';

const props = defineProps(['student']);
const emit = defineEmits(['back', 'planGenerated', 'takeDiagnostic']);

const loading = ref(true);
const step = ref('map'); // map | input
const skillMapData = ref(null);
const hasDiagnosticData = ref(false);

// NGMT/NGRT form state (optional overlay)
const form = ref({
  mSAS: '', mNPR: '', rSAS: '', rNPR: '',
  mDomains: { Number: null, Algebra: null, Geometry: null, Statistics: null },
  rDomains: { 'Sentence completion': null, 'Passage comprehension': null, Vocabulary: null },
});

const NGMT_DOMAINS = ['Number', 'Algebra', 'Geometry', 'Statistics'];
const NGRT_DOMAINS = ['Sentence completion', 'Passage comprehension', 'Vocabulary'];
const DOMAIN_VALS = ['weak', 'average', 'strong'];

// Skill node definitions — display names
const SKILL_NODES = {
  Number: [
    { id: 'place-value-large',   name: 'Place value' },
    { id: 'fractions-basic',     name: 'Fractions' },
    { id: 'fractions-add',       name: 'Adding fractions' },
    { id: 'decimals-basic',      name: 'Decimals' },
    { id: 'percentages-basic',   name: 'Percentages' },
    { id: 'ratio-basic',         name: 'Ratio & proportion' },
    { id: 'prime-factorisation', name: 'Prime factorisation' },
    { id: 'percentages-change',  name: 'Percentage change' },
    { id: 'standard-form',       name: 'Standard form' },
    { id: 'surds',               name: 'Surds' },
  ],
  Algebra: [
    { id: 'algebra-intro',          name: 'Algebra intro' },
    { id: 'equations-linear-basic', name: 'Linear equations' },
    { id: 'sequences-linear',       name: 'Sequences' },
    { id: 'graphs-linear',          name: 'Linear graphs' },
    { id: 'algebra-expand',         name: 'Expanding brackets' },
    { id: 'algebra-factorise',      name: 'Factorising' },
    { id: 'equations-simultaneous', name: 'Simultaneous equations' },
    { id: 'quadratics-factorise',   name: 'Quadratics' },
  ],
  Geometry: [
    { id: 'angles-intro',       name: 'Angles intro' },
    { id: 'angles-triangles',   name: 'Angles in triangles' },
    { id: 'area-triangle',      name: 'Area — triangles' },
    { id: 'pythagoras',         name: 'Pythagoras' },
    { id: 'transformations',    name: 'Transformations' },
    { id: 'area-circle',        name: 'Circle area' },
    { id: 'volume-basic',       name: 'Volume' },
    { id: 'trigonometry-basic', name: 'Trigonometry' },
    { id: 'circle-theorems',    name: 'Circle theorems' },
  ],
  Statistics: [
    { id: 'mean-median-mode',     name: 'Averages & range' },
    { id: 'probability-basic',    name: 'Probability basics' },
    { id: 'frequency-tables',     name: 'Frequency tables' },
    { id: 'probability-combined', name: 'Combined probability' },
    { id: 'probability-tree',     name: 'Tree diagrams' },
    { id: 'data-basic',           name: 'Data & charts' },
  ],
};

// NGMT domain → skill nodes it informs (lower confidence signals)
const NGMT_NODE_MAP = {
  Number:     ['place-value-large','fractions-basic','decimals-basic','percentages-basic','ratio-basic','prime-factorisation','percentages-change'],
  Algebra:    ['algebra-intro','equations-linear-basic','sequences-linear','graphs-linear','algebra-expand','equations-simultaneous'],
  Geometry:   ['angles-triangles','area-triangle','pythagoras','area-circle','volume-basic','trigonometry-basic'],
  Statistics: ['mean-median-mode','probability-basic','frequency-tables','probability-combined'],
};

// Build the combined node map:
// Priority: diagnostic (confirmed) > NGMT domain > SAS estimate > no data
function buildNodeMap() {
  const diagNodes = skillMapData.value?.nodes || {};
  const combined = {};

  // Start: all nodes as unknown
  Object.values(SKILL_NODES).flat().forEach(n => {
    combined[n.id] = { confidence: null, source: 'none', evidence: 'Not yet tested' };
  });

  // Layer 1: NGMT domain scores (if entered)
  if (form.value.mSAS || Object.values(form.value.mDomains).some(v => v)) {
    const sas = parseInt(form.value.mSAS);
    const sasConf = sas >= 120 ? 72 : sas >= 110 ? 60 : sas >= 100 ? 48 : sas >= 90 ? 33 : 20;

    NGMT_DOMAINS.forEach(domain => {
      const val = form.value.mDomains[domain];
      const domConf = val === 'strong' ? 68 : val === 'weak' ? 25 : val === 'average' ? 48 : (sas ? sasConf : null);
      if (domConf === null) return;

      (NGMT_NODE_MAP[domain] || []).forEach(nodeId => {
        if (combined[nodeId]?.source === 'none') {
          combined[nodeId] = {
            confidence: domConf,
            source: val ? 'ngmt' : 'ngmt-sas',
            evidence: val
              ? `${domain} domain marked ${val} on NGMT report`
              : `Inferred from overall NGMT SAS ${sas}`,
          };
        }
      });
    });
  }

  // Layer 2: Diagnostic results — highest priority, overrides everything
  Object.entries(diagNodes).forEach(([nodeId, nodeData]) => {
    if (combined[nodeId] !== undefined) {
      combined[nodeId] = {
        confidence: nodeData.confidence,
        source: 'diagnostic',
        evidence: nodeData.evidence,
        correct: nodeData.correct,
        attempted: nodeData.attempted,
        lastTested: nodeData.lastTested,
      };
    }
  });

  return combined;
}

// Computed map
const nodeMap = computed(() => buildNodeMap());

const confirmedGaps = computed(() =>
  Object.entries(nodeMap.value)
    .filter(([, v]) => v.source === 'diagnostic' && v.confidence < 45)
    .sort((a, b) => a[1].confidence - b[1].confidence)
);

const assumedGaps = computed(() =>
  Object.entries(nodeMap.value)
    .filter(([, v]) => (v.source === 'ngmt' || v.source === 'ngmt-sas') && v.confidence < 45)
    .sort((a, b) => a[1].confidence - b[1].confidence)
);

const confirmedStrong = computed(() =>
  Object.values(nodeMap.value).filter(v => v.source === 'diagnostic' && v.confidence >= 70).length
);

const unknownCount = computed(() =>
  Object.values(nodeMap.value).filter(v => v.source === 'none').length
);

const totalTested = computed(() =>
  Object.values(nodeMap.value).filter(v => v.source === 'diagnostic').length
);

function barColor(node) {
  if (!node || node.source === 'none') return '#D1D5DB';
  if (node.confidence >= 70) return '#15803d';
  if (node.confidence >= 45) return '#b45309';
  return '#b91c1c';
}

function barWidth(node) {
  if (!node || node.confidence === null || node.source === 'none') return 20;
  return node.confidence;
}

function sourceLabel(src) {
  if (src === 'diagnostic') return 'confirmed';
  if (src === 'ngmt') return 'NGMT';
  if (src === 'ngmt-sas') return 'SAS est.';
  return 'no data';
}

function sourceCls(src) {
  if (src === 'diagnostic') return 'bg-green-50 text-green-800';
  if (src === 'ngmt' || src === 'ngmt-sas') return 'bg-amber-50 text-amber-800';
  return 'bg-gray-100 text-gray-500';
}

function nodeById(id) {
  return Object.values(SKILL_NODES).flat().find(n => n.id === id);
}

const sasLevel = computed(() => {
  const s = parseInt(form.value.mSAS);
  if (!s) return null;
  if (s >= 120) return { label: 'Well above average', color: '#15803d' };
  if (s >= 110) return { label: 'Above average', color: '#15803d' };
  if (s >= 100) return { label: 'Average', color: '#b45309' };
  if (s >= 90)  return { label: 'Below average', color: '#b45309' };
  return { label: 'Needs support', color: '#b91c1c' };
});

onMounted(async () => {
  loading.value = true;
  try {
    const map = await db.getSkillMap(props.student?.name || '');
    if (map && map.summary.totalTested > 0) {
      skillMapData.value = map;
      hasDiagnosticData.value = true;
    }
  } catch (e) {
    console.error('Failed to load skill map:', e);
  } finally {
    loading.value = false;
  }
});

function saveNGMT() {
  // Skill map will recompute automatically via computed
  step.value = 'map';
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 overflow-y-auto">

    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
      <button @click="emit('back')" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
        <i class="ti ti-arrow-left text-lg" aria-hidden="true"></i>
      </button>
      <div class="flex-1">
        <h1 class="text-base font-bold text-gray-900">Skill Map</h1>
        <p class="text-xs text-gray-500">{{ props.student?.name }}</p>
      </div>
      <button v-if="step === 'map'" @click="step = 'input'"
        class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1.5">
        <i class="ti ti-file-text text-xs" aria-hidden="true"></i>
        Add NGMT/NGRT
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-24">
      <div class="text-center">
        <div class="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-sm text-gray-500">Loading skill map...</p>
      </div>
    </div>

    <div v-else>

      <!-- ── NO DIAGNOSTIC DATA ──────────────────────────── -->
      <div v-if="!hasDiagnosticData && step === 'map'" class="max-w-xl mx-auto px-6 py-16 text-center">
        <div class="text-5xl mb-4">📊</div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">No diagnostic data yet</h2>
        <p class="text-sm text-gray-500 mb-8 leading-relaxed">
          {{ props.student?.name }} hasn't taken the adaptive diagnostic test yet.
          Take the 20-question test to build an accurate, evidence-based skill map.
        </p>
        <div class="space-y-3">
          <button @click="emit('takeDiagnostic')"
            class="w-full bg-indigo-600 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
            <i class="ti ti-clipboard-check" aria-hidden="true"></i>
            Take the diagnostic test (20 min)
          </button>
          <button @click="step = 'input'"
            class="w-full bg-white border border-gray-200 text-gray-700 py-3.5 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors">
            I have NGMT/NGRT scores instead
          </button>
        </div>
      </div>

      <!-- ── NGMT INPUT FORM ─────────────────────────────── -->
      <div v-else-if="step === 'input'" class="max-w-2xl mx-auto px-6 py-8 space-y-5">

        <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 leading-relaxed">
          <i class="ti ti-shield-check mr-1.5 text-blue-600" aria-hidden="true"></i>
          NGMT/NGRT scores add context but are shown separately from confirmed diagnostic evidence.
          We never mix assumed data with confirmed data.
        </div>

        <!-- NGMT -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">NGMT — Maths</h3>
          <div class="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label class="block text-xs text-gray-500 mb-1">SAS score</label>
              <input v-model="form.mSAS" type="number" min="70" max="140"
                placeholder="e.g. 105 (leave blank if unknown)"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Percentile (NPR)</label>
              <input v-model="form.mNPR" type="number" min="1" max="99"
                placeholder="e.g. 63"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <h4 class="text-xs font-medium text-gray-400 mb-3">Domain performance
            <span class="font-normal">(leave blank if not on report)</span>
          </h4>
          <div v-for="domain in NGMT_DOMAINS" :key="domain" class="flex items-center gap-3 mb-2">
            <span class="text-sm text-gray-700 w-28 flex-shrink-0">{{ domain }}</span>
            <div class="flex gap-2">
              <button v-for="val in DOMAIN_VALS" :key="val"
                @click="form.mDomains[domain] = form.mDomains[domain] === val ? null : val"
                :class="['text-xs px-3 py-1.5 rounded-lg border font-medium transition-all',
                  form.mDomains[domain] === val
                    ? val === 'weak'    ? 'bg-red-50 border-red-300 text-red-700'
                    : val === 'average' ? 'bg-amber-50 border-amber-300 text-amber-700'
                    :                    'bg-green-50 border-green-300 text-green-700'
                    : 'border-gray-200 text-gray-400 bg-gray-50 hover:border-gray-300']">
                {{ val.charAt(0).toUpperCase() + val.slice(1) }}
              </button>
            </div>
          </div>
        </div>

        <!-- NGRT -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">NGRT — Reading</h3>
          <div class="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label class="block text-xs text-gray-500 mb-1">SAS score</label>
              <input v-model="form.rSAS" type="number" min="70" max="140"
                placeholder="e.g. 98"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Percentile (NPR)</label>
              <input v-model="form.rNPR" type="number" min="1" max="99"
                placeholder="e.g. 45"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div v-for="domain in NGRT_DOMAINS" :key="domain" class="flex items-center gap-3 mb-2">
            <span class="text-sm text-gray-700 w-44 flex-shrink-0">{{ domain }}</span>
            <div class="flex gap-2">
              <button v-for="val in DOMAIN_VALS" :key="val"
                @click="form.rDomains[domain] = form.rDomains[domain] === val ? null : val"
                :class="['text-xs px-3 py-1.5 rounded-lg border font-medium transition-all',
                  form.rDomains[domain] === val
                    ? val === 'weak'    ? 'bg-red-50 border-red-300 text-red-700'
                    : val === 'average' ? 'bg-amber-50 border-amber-300 text-amber-700'
                    :                    'bg-green-50 border-green-300 text-green-700'
                    : 'border-gray-200 text-gray-400 bg-gray-50 hover:border-gray-300']">
                {{ val.charAt(0).toUpperCase() + val.slice(1) }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex gap-3 justify-end">
          <button @click="step = hasDiagnosticData ? 'map' : 'map'" class="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
            Cancel
          </button>
          <button @click="saveNGMT" class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
            Apply to skill map
          </button>
        </div>
      </div>

      <!-- ── SKILL MAP VIEW ──────────────────────────────── -->
      <div v-else class="max-w-2xl mx-auto px-6 py-8 space-y-5">

        <!-- Trust banner -->
        <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 leading-relaxed">
          <i class="ti ti-info-circle text-blue-600 mr-1.5" aria-hidden="true"></i>
          <strong>Solid bars</strong> = confirmed from diagnostic.
          <strong>Dashed</strong> = inferred from NGMT only — verify before acting.
          <strong>Grey</strong> = not yet tested.
        </div>

        <!-- Summary -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="text-2xl font-bold text-indigo-600">{{ totalTested }}</div>
            <div class="text-xs text-gray-500 mt-1">Topics tested</div>
          </div>
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="text-2xl font-bold text-green-700">{{ confirmedStrong }}</div>
            <div class="text-xs text-gray-500 mt-1">Confirmed strong</div>
          </div>
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="text-2xl font-bold text-red-600">{{ confirmedGaps.length }}</div>
            <div class="text-xs text-gray-500 mt-1">Confirmed gaps</div>
          </div>
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="text-2xl font-bold text-gray-400">{{ unknownCount }}</div>
            <div class="text-xs text-gray-500 mt-1">Not yet tested</div>
          </div>
        </div>

        <!-- SAS display if entered -->
        <div v-if="sasLevel" class="bg-white border border-gray-200 rounded-xl p-5">
          <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">NGMT SAS</div>
          <div class="flex items-baseline gap-3">
            <span class="text-3xl font-bold" :style="{ color: sasLevel.color }">{{ form.mSAS }}</span>
            <span class="text-sm text-gray-500">{{ sasLevel.label }}</span>
          </div>
          <div class="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div class="h-full rounded-full" :style="{ width: Math.min(((parseInt(form.mSAS)-70)/70)*100, 100) + '%', backgroundColor: sasLevel.color }"></div>
          </div>
          <div class="flex justify-between text-xs text-gray-400 mt-1">
            <span>70</span><span>100 avg</span><span>140</span>
          </div>
        </div>

        <!-- Skill map by domain -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-gray-900">Skill map by domain</h3>
            <button @click="emit('takeDiagnostic')"
              class="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-medium">
              + Take diagnostic
            </button>
          </div>

          <!-- Legend -->
          <div class="flex gap-4 flex-wrap mb-5 text-xs text-gray-500">
            <div class="flex items-center gap-1.5"><div class="w-6 h-1.5 rounded-full bg-green-700"></div>Confirmed strong (70%+)</div>
            <div class="flex items-center gap-1.5"><div class="w-6 h-1.5 rounded-full bg-amber-600"></div>Developing (45-69%)</div>
            <div class="flex items-center gap-1.5"><div class="w-6 h-1.5 rounded-full bg-red-700"></div>Confirmed gap (&lt;45%)</div>
            <div class="flex items-center gap-1.5"><div class="w-6 h-1.5 rounded-full bg-gray-300"></div>Not tested</div>
          </div>

          <div v-for="(nodes, section) in SKILL_NODES" :key="section" class="mb-5">
            <div class="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 pb-1 border-b border-gray-100">
              {{ section }}
            </div>
            <div v-for="node in nodes" :key="node.id" class="flex items-center gap-2 mb-2">
              <div class="text-xs text-gray-600 w-40 flex-shrink-0 truncate" :title="node.name">{{ node.name }}</div>
              <div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"
                :class="nodeMap[node.id]?.source === 'ngmt' || nodeMap[node.id]?.source === 'ngmt-sas' ? 'outline outline-1 outline-dashed outline-amber-400' : ''">
                <div class="h-full rounded-full transition-all duration-700"
                  :style="{
                    width: barWidth(nodeMap[node.id]) + '%',
                    backgroundColor: barColor(nodeMap[node.id]),
                    opacity: nodeMap[node.id]?.source === 'none' ? 0.25 : 1
                  }">
                </div>
              </div>
              <div class="text-xs w-7 text-right text-gray-500">
                {{ nodeMap[node.id]?.source === 'none' ? '—' : nodeMap[node.id]?.confidence + '%' }}
              </div>
              <div :class="['text-xs px-1.5 py-0.5 rounded text-xs w-20 text-center flex-shrink-0', sourceCls(nodeMap[node.id]?.source || 'none')]">
                {{ sourceLabel(nodeMap[node.id]?.source || 'none') }}
              </div>
            </div>
          </div>
        </div>

        <!-- Confirmed gaps -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <h3 class="text-sm font-bold text-gray-900 mb-1">Confirmed gaps</h3>
          <p class="text-xs text-gray-400 mb-4">Based on diagnostic test answers only.</p>

          <div v-if="confirmedGaps.length === 0" class="py-4 text-center">
            <div class="text-2xl mb-2">✅</div>
            <p class="text-sm text-gray-500">No confirmed gaps from tested topics.</p>
          </div>

          <div v-for="([nodeId, nodeData], i) in confirmedGaps" :key="nodeId"
            class="border border-gray-100 rounded-xl p-4 mb-3 bg-red-50">
            <div class="flex items-center gap-2 mb-1.5">
              <span :class="['text-xs px-2 py-0.5 rounded-full font-bold',
                i === 0 ? 'bg-red-200 text-red-800' :
                i === 1 ? 'bg-orange-100 text-orange-700' :
                'bg-amber-100 text-amber-700']">
                Priority {{ i + 1 }}
              </span>
              <span class="text-sm font-semibold text-gray-900">{{ nodeById(nodeId)?.name || nodeId }}</span>
              <span class="ml-auto text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">confirmed</span>
            </div>
            <p class="text-xs text-gray-600 leading-relaxed">{{ nodeData.evidence }}</p>
          </div>
        </div>

        <!-- Assumed gaps (NGMT only) — clearly separated -->
        <div v-if="assumedGaps.length > 0" class="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 class="text-sm font-bold text-amber-800 mb-2">Possible gaps — verify first</h3>
          <p class="text-xs text-amber-700 mb-4 leading-relaxed">
            From NGMT domain scores only — not direct test evidence.
            Include 1–2 questions in the next session to confirm before building a plan.
          </p>
          <div v-for="([nodeId, nodeData]) in assumedGaps.slice(0, 5)" :key="nodeId"
            class="border border-amber-200 rounded-xl p-3 mb-2 bg-white">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">Verify</span>
              <span class="text-sm font-semibold text-gray-800">{{ nodeById(nodeId)?.name || nodeId }}</span>
            </div>
            <p class="text-xs text-gray-500">{{ nodeData.evidence }}</p>
          </div>
        </div>

        <!-- Unknown nodes -->
        <div v-if="unknownCount > 0" class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex gap-3">
          <i class="ti ti-help-circle text-gray-400 text-lg flex-shrink-0 mt-0.5" aria-hidden="true"></i>
          <p class="text-sm text-gray-500">
            <strong class="text-gray-700">{{ unknownCount }} topics not yet tested.</strong>
            Take the diagnostic test to fill these in with confirmed evidence.
          </p>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button @click="emit('takeDiagnostic')"
            class="flex-1 bg-white border border-indigo-200 text-indigo-700 py-3 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors">
            Take diagnostic
          </button>
          <button
            @click="emit('planGenerated', { skillMap: nodeMap, confirmedGaps: confirmedGaps })"
            class="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
            Generate study plan
            <i class="ti ti-arrow-right text-sm" aria-hidden="true"></i>
          </button>
        </div>

      </div>
    </div>
  </div>
</template>