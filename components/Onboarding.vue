<script setup>
/**
 * Onboarding.vue — parent-driven child setup (Beast-Academy style).
 *
 * Flow:
 *   1. Profile      — username + password (child's login), display name, age band, target exam
 *   2. Reports?     — "Do you have NGMT/NGRT/GL school reports?"  yes -> scores | no -> skip
 *   3. Scores       — SAS / NPR / domain strengths (optional)
 *   4. AI analysis  — non-committal recommendation; always points to the diagnostic to CONFIRM
 *   5. Create       — saves the child under this parent
 */
import { ref, computed } from 'vue';
import { db } from '../services/dbService';

const props = defineProps(['parentEmail']);
const emit = defineEmits(['created', 'cancel']);

const step = ref('profile'); // profile | reports | scores | analysis
const busy = ref(false);
const error = ref('');

// Step 1
const username = ref('');
const password = ref('');
const displayName = ref('');
const ageBand = ref('');
const targetExam = ref('');
const AGE_BANDS = ['6-7', '8-9', '10-11', '12-13', '14-15', '16+'];
const EXAMS = ['SASMO', 'AMC 8', 'AMC 10', 'GCSE', 'CBSE Grade 10', 'Maths Olympiad', 'Not sure yet'];

// Step 3 — reports
const reports = ref({
  ngmt: { sas: '', npr: '', domains: { Number: '', Algebra: '', Geometry: '', Statistics: '' } },
  ngrt: { sas: '', npr: '' },
  gl:   { sas: '', npr: '' },
});
const DOMAIN_VALS = ['weak', 'average', 'strong'];

// Step 4
const aiAnalysis = ref('');
const recommendedLevel = ref('');

function next(s) { error.value = ''; step.value = s; }

function validProfile() {
  if (!username.value.trim() || !password.value.trim()) { error.value = 'Username and password are required.'; return false; }
  if (password.value.length < 4) { error.value = 'Password should be at least 4 characters.'; return false; }
  return true;
}

async function runAnalysis() {
  busy.value = true; error.value = '';
  const r = reports.value;
  const lines = [];
  if (r.ngmt.sas) lines.push(`NGMT (maths) SAS ${r.ngmt.sas}${r.ngmt.npr ? `, percentile ${r.ngmt.npr}` : ''}`);
  const doms = Object.entries(r.ngmt.domains).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (doms.length) lines.push(`NGMT domains — ${doms.join(', ')}`);
  if (r.ngrt.sas) lines.push(`NGRT (reading) SAS ${r.ngrt.sas}${r.ngrt.npr ? `, percentile ${r.ngrt.npr}` : ''}`);
  if (r.gl.sas) lines.push(`GL assessment SAS ${r.gl.sas}${r.gl.npr ? `, percentile ${r.gl.npr}` : ''}`);

  const system = 'You are an evidence-careful education adviser. School test scores are INFERENCES, never confirmed knowledge. Never state a child definitely has or lacks a skill from a report alone. Always recommend the adaptive diagnostic to CONFIRM. Be concise, warm, 2-3 sentences. End by stating a likely starting Level band (3-9) clearly as an estimate to verify.';
  const prompt = `Child age band: ${ageBand.value || 'unknown'}. Target exam: ${targetExam.value || 'unknown'}.\nSchool reports provided:\n${lines.length ? lines.join('\n') : 'None provided.'}\n\nGive a short, non-committal recommendation and an estimated starting Level band to confirm with the diagnostic.`;

  const text = await db.aiGenerate(prompt, system);
  aiAnalysis.value = text || `Based on the information provided${ageBand.value ? ` for a ${ageBand.value} year old` : ''}, we recommend starting with the adaptive diagnostic to confirm the right level. Nothing here is assumed — the 20-question test will pinpoint exactly where to begin.`;
  const m = aiAnalysis.value.match(/level\s*(\d)\s*[-–to]+\s*(\d)/i) || aiAnalysis.value.match(/level\s*(\d)/i);
  recommendedLevel.value = m ? (m[2] ? `${m[1]}-${m[2]}` : m[1]) : '';
  busy.value = false;
  step.value = 'analysis';
}

async function create() {
  if (!validProfile()) { step.value = 'profile'; return; }
  busy.value = true; error.value = '';
  const res = await db.createChild({
    parentEmail: props.parentEmail,
    username: username.value.trim(),
    password: password.value,
    displayName: displayName.value.trim() || username.value.trim(),
    ageBand: ageBand.value,
    targetExam: targetExam.value,
    reports: reports.value,
    aiAnalysis: aiAnalysis.value,
    recommendedLevel: recommendedLevel.value,
  });
  busy.value = false;
  if (res.ok) emit('created', res.profile);
  else error.value = res.error === 'username_taken' ? 'That username is taken — choose another.' : 'Could not create the account. Try again.';
}

const hasAnyScore = computed(() =>
  reports.value.ngmt.sas || reports.value.ngrt.sas || reports.value.gl.sas ||
  Object.values(reports.value.ngmt.domains).some(v => v));
</script>

<template>
  <div class="max-w-lg mx-auto px-2 py-2">
    <div class="flex items-center gap-3 mb-5">
      <button @click="emit('cancel')" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">←</button>
      <div>
        <h1 class="text-base font-black text-slate-900">Add a child</h1>
        <p class="text-[11px] text-slate-400">Create their login and (optionally) add school reports</p>
      </div>
    </div>

    <div v-if="error" class="bg-rose-50 text-rose-600 p-2.5 rounded-xl text-xs font-bold text-center mb-4">⚠️ {{ error }}</div>

    <!-- STEP 1: profile -->
    <div v-if="step === 'profile'" class="space-y-4">
      <div class="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="lbl">Username (child's login)</label>
            <input v-model="username" type="text" placeholder="mishka2025" class="inp" />
          </div>
          <div>
            <label class="lbl">Password</label>
            <input v-model="password" type="text" placeholder="min 4 chars" class="inp" />
          </div>
        </div>
        <div>
          <label class="lbl">Child's name</label>
          <input v-model="displayName" type="text" placeholder="Mishka" class="inp" />
        </div>
        <div>
          <label class="lbl">Age band</label>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="b in AGE_BANDS" :key="b" @click="ageBand = b"
              :class="['chip', ageBand === b ? 'chip-on' : 'chip-off']">{{ b }}</button>
          </div>
        </div>
        <div>
          <label class="lbl">Target exam</label>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="e in EXAMS" :key="e" @click="targetExam = e"
              :class="['chip', targetExam === e ? 'chip-on' : 'chip-off']">{{ e }}</button>
          </div>
        </div>
      </div>
      <button @click="validProfile() && next('reports')" class="btn-primary">Continue</button>
    </div>

    <!-- STEP 2: reports? -->
    <div v-else-if="step === 'reports'" class="space-y-4">
      <div class="bg-white border border-slate-200 rounded-2xl p-6 text-center">
        <div class="text-4xl mb-3">📄</div>
        <h2 class="text-lg font-bold text-slate-900 mb-1">Do you have school reports?</h2>
        <p class="text-xs text-slate-500 mb-5 leading-relaxed">NGMT, NGRT or GL assessment scores add helpful context. They're treated as estimates only — the diagnostic confirms the real picture.</p>
        <div class="space-y-2.5">
          <button @click="next('scores')" class="btn-primary">Yes — I'll add scores</button>
          <button @click="aiAnalysis=''; recommendedLevel=''; create()" :disabled="busy" class="btn-ghost">{{ busy ? 'Creating…' : 'No — start fresh with the diagnostic' }}</button>
        </div>
      </div>
    </div>

    <!-- STEP 3: scores -->
    <div v-else-if="step === 'scores'" class="space-y-4">
      <div class="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-800 leading-relaxed">
        Enter whatever you have — every field is optional. Scores are shown as <strong>estimates</strong>, never confirmed evidence.
      </div>
      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">NGMT — Maths</h3>
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div><label class="lbl">SAS</label><input v-model="reports.ngmt.sas" type="number" placeholder="e.g. 105" class="inp" /></div>
          <div><label class="lbl">Percentile (NPR)</label><input v-model="reports.ngmt.npr" type="number" placeholder="e.g. 63" class="inp" /></div>
        </div>
        <label class="lbl">Domain strengths (optional)</label>
        <div v-for="d in Object.keys(reports.ngmt.domains)" :key="d" class="flex items-center gap-2 mb-1.5">
          <span class="text-xs text-slate-600 w-24 flex-shrink-0">{{ d }}</span>
          <button v-for="v in DOMAIN_VALS" :key="v" @click="reports.ngmt.domains[d] = reports.ngmt.domains[d] === v ? '' : v"
            :class="['chip', reports.ngmt.domains[d] === v ? 'chip-on' : 'chip-off']">{{ v }}</button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">NGRT — Reading</h3>
          <label class="lbl">SAS</label><input v-model="reports.ngrt.sas" type="number" placeholder="98" class="inp mb-2" />
          <label class="lbl">NPR</label><input v-model="reports.ngrt.npr" type="number" placeholder="45" class="inp" />
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">GL Assessment</h3>
          <label class="lbl">SAS</label><input v-model="reports.gl.sas" type="number" placeholder="102" class="inp mb-2" />
          <label class="lbl">NPR</label><input v-model="reports.gl.npr" type="number" placeholder="55" class="inp" />
        </div>
      </div>
      <button @click="runAnalysis" :disabled="busy" class="btn-primary">{{ busy ? 'Analysing…' : (hasAnyScore ? 'Analyse & continue' : 'Skip — continue') }}</button>
    </div>

    <!-- STEP 4: analysis -->
    <div v-else-if="step === 'analysis'" class="space-y-4">
      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xl">🧭</span>
          <h2 class="text-sm font-bold text-slate-900">AI recommendation</h2>
          <span v-if="recommendedLevel" class="ml-auto text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold">Est. Level {{ recommendedLevel }}</span>
        </div>
        <p class="text-sm text-slate-700 leading-relaxed">{{ aiAnalysis }}</p>
        <div class="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-800">
          This is an estimate from reports only. The adaptive diagnostic will confirm the real starting point.
        </div>
      </div>
      <button @click="create" :disabled="busy" class="btn-primary">{{ busy ? 'Creating…' : 'Create account' }}</button>
    </div>
  </div>
</template>

<style scoped>
.lbl { display:block; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:0.1em; color:#94a3b8; margin-bottom:0.25rem; }
.inp { width:100%; padding:0.55rem 0.75rem; border-radius:0.6rem; border:2px solid #f1f5f9; background:#f8fafc; outline:none; font-weight:700; font-size:0.8rem; }
.inp:focus { border-color:#6366f1; background:white; }
.chip { font-size:11px; padding:0.3rem 0.7rem; border-radius:999px; font-weight:700; border:1px solid; text-transform:capitalize; }
.chip-on { background:#eef2ff; border-color:#a5b4fc; color:#4338ca; }
.chip-off { background:#f8fafc; border-color:#e2e8f0; color:#94a3b8; }
.btn-primary { width:100%; padding:0.85rem; background:#4f46e5; color:white; border-radius:1rem; font-weight:800; font-size:0.9rem; }
.btn-primary:hover { background:#4338ca; }
.btn-primary:disabled { opacity:0.5; }
.btn-ghost { width:100%; padding:0.85rem; background:white; color:#475569; border:1px solid #e2e8f0; border-radius:1rem; font-weight:700; font-size:0.85rem; }
.btn-ghost:hover { background:#f8fafc; }
</style>
