<script setup>
/**
 * ParentDashboard.vue — parent's home. Lists their children, launches the
 * onboarding flow to add more, and shows each child's reports + AI analysis +
 * confirmed diagnostic status (gaps/strengths) pulled from the skill map.
 */
import { ref, onMounted } from 'vue';
import { db } from '../services/dbService';
import Onboarding from './Onboarding.vue';
import { nodeName } from '../services/skillGraph';

const props = defineProps(['parent']);
const emit = defineEmits(['logout']);

const view = ref('list'); // list | add
const loading = ref(true);
const children = ref([]);
const selected = ref(null);     // child being viewed in detail
const skillByChild = ref({});   // username -> skill map summary

async function load() {
  loading.value = true;
  const kids = await db.getChildren(props.parent?.email || props.parent?.name);
  children.value = kids;
  // Pull each child's confirmed skill-map summary in parallel
  await Promise.all(kids.map(async (c) => {
    const map = await db.getSkillMap(c.name);
    if (map) skillByChild.value[c.name] = map;
  }));
  loading.value = false;
}
onMounted(load);

function onCreated() {
  view.value = 'list';
  load();
}

function gapsFor(c) {
  const m = skillByChild.value[c.name];
  if (!m?.nodes) return [];
  return Object.entries(m.nodes)
    .filter(([, v]) => v.confidence < 45)
    .sort((a, b) => a[1].confidence - b[1].confidence);
}
function strongFor(c) {
  const m = skillByChild.value[c.name];
  if (!m?.nodes) return 0;
  return Object.values(m.nodes).filter(v => v.confidence >= 70).length;
}
function testedFor(c) {
  return skillByChild.value[c.name]?.summary?.totalTested || 0;
}

function reportLines(c) {
  const r = c.reports || {};
  const out = [];
  if (r.ngmt?.sas) out.push({ label: 'NGMT (maths) SAS', val: r.ngmt.sas, npr: r.ngmt.npr });
  if (r.ngrt?.sas) out.push({ label: 'NGRT (reading) SAS', val: r.ngrt.sas, npr: r.ngrt.npr });
  if (r.gl?.sas) out.push({ label: 'GL SAS', val: r.gl.sas, npr: r.gl.npr });
  return out;
}
function domainList(c) {
  const d = c.reports?.ngmt?.domains || {};
  return Object.entries(d).filter(([, v]) => v);
}
</script>

<template>
  <div class="pb-6">
    <!-- ADD CHILD -->
    <Onboarding v-if="view === 'add'" :parentEmail="parent?.email || parent?.name"
      @created="onCreated" @cancel="view = 'list'" />

    <!-- LIST -->
    <template v-else>
      <div class="flex items-center gap-3 mb-5">
        <div class="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black">
          {{ (parent?.displayName || parent?.email || 'P').charAt(0).toUpperCase() }}
        </div>
        <div class="flex-1">
          <h1 class="text-base font-black text-slate-900">{{ parent?.displayName || 'Parent' }}'s family</h1>
          <p class="text-[11px] text-slate-400">{{ parent?.email }}</p>
        </div>
        <button @click="emit('logout')" class="text-xs text-slate-400 hover:text-slate-600 font-bold">Log out</button>
      </div>

      <div v-if="loading" class="flex flex-col items-center py-16 text-slate-400">
        <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
        Loading children…
      </div>

      <template v-else>
        <!-- Empty state -->
        <div v-if="children.length === 0" class="bg-white border border-slate-200 rounded-2xl p-8 text-center mb-4">
          <div class="text-4xl mb-3">👋</div>
          <h2 class="text-lg font-bold text-slate-900 mb-1">No children yet</h2>
          <p class="text-xs text-slate-500 mb-5">Add your first child to create their login and start their learning journey.</p>
          <button @click="view = 'add'" class="btn-primary">+ Add a child</button>
        </div>

        <!-- Children grid -->
        <div v-else class="space-y-3">
          <div v-for="c in children" :key="c.name"
            class="bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-indigo-300 transition-colors"
            @click="selected = selected?.name === c.name ? null : c">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center font-black text-lg">
                {{ (c.displayName || c.name).charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 text-sm">{{ c.displayName || c.name }}</div>
                <div class="text-[11px] text-slate-400 truncate">
                  @{{ c.name }}<span v-if="c.ageBand"> · {{ c.ageBand }}</span><span v-if="c.targetExam"> · {{ c.targetExam }}</span>
                </div>
              </div>
              <div class="text-right">
                <div v-if="testedFor(c) > 0" class="flex gap-1.5">
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-bold">{{ strongFor(c) }} strong</span>
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-bold">{{ gapsFor(c).length }} gaps</span>
                </div>
                <span v-else class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold">No diagnostic yet</span>
              </div>
            </div>

            <!-- Detail (expand) -->
            <div v-if="selected?.name === c.name" class="mt-4 pt-4 border-t border-slate-100 space-y-3" @click.stop>
              <!-- Reports -->
              <div v-if="reportLines(c).length || domainList(c).length">
                <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">School reports (estimates)</div>
                <div class="flex flex-wrap gap-1.5 mb-1.5">
                  <span v-for="r in reportLines(c)" :key="r.label" class="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                    {{ r.label }} <b>{{ r.val }}</b><span v-if="r.npr"> · NPR {{ r.npr }}</span>
                  </span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="[d,v] in domainList(c)" :key="d"
                    :class="['text-[11px] px-2 py-0.5 rounded-lg',
                      v === 'strong' ? 'bg-green-50 text-green-700' : v === 'weak' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700']">
                    {{ d }}: {{ v }}
                  </span>
                </div>
              </div>

              <!-- AI analysis -->
              <div v-if="c.aiAnalysis">
                <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">AI recommendation</div>
                <p class="text-xs text-slate-600 leading-relaxed bg-indigo-50/50 rounded-lg p-2.5">{{ c.aiAnalysis }}</p>
              </div>

              <!-- Confirmed gaps -->
              <div v-if="testedFor(c) > 0">
                <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Confirmed gaps (from diagnostic)</div>
                <div v-if="gapsFor(c).length === 0" class="text-xs text-green-600">No confirmed gaps — well done!</div>
                <div v-else class="flex flex-wrap gap-1.5">
                  <span v-for="[nid] in gapsFor(c)" :key="nid" class="text-[11px] px-2 py-0.5 rounded-lg bg-red-50 text-red-700 font-medium">{{ nodeName(nid) }}</span>
                </div>
              </div>
              <div v-else class="text-xs text-slate-400">
                {{ c.displayName || c.name }} hasn't taken the diagnostic yet. They can log in with <b>@{{ c.name }}</b> to start.
              </div>
            </div>
          </div>

          <button @click="view = 'add'" class="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 font-bold text-sm transition-colors">
            + Add another child
          </button>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.btn-primary { padding:0.7rem 1.5rem; background:#4f46e5; color:white; border-radius:1rem; font-weight:800; font-size:0.85rem; }
.btn-primary:hover { background:#4338ca; }
</style>
