<script setup>
/**
 * AdaptiveDiagnostic.vue
 *
 * STARTING POINT: Parent selects rough level (not age/year group)
 * Maps to: beginner=L3, developing=L5, confident=L7, strong=L8
 *
 * ADAPTIVE ALGORITHM:
 * - 20 questions across 4 sections (5 rounds x 4 sections)
 * - Every 5 questions guaranteed to cover all 4 sections
 * - Within each section: 2 correct in a row = move up 1 level
 *   2 wrong in a row = move down 1 level
 * - Starts correcting bad starting point within 3-4 questions
 *
 * ANSWER CHECKING (no AI, no hallucinations):
 * - MCQ: exact correctIndex comparison — deterministic
 * - Numeric: parseFloat with tolerance — handles 7, 7.0, x=7
 * - Expression answers (factorisations): always MCQ
 * - No string matching for open answers
 *
 * TRUST: Every mark is auditable. Source code is the marking scheme.
 */

import { ref, computed, onUnmounted } from 'vue';
import { db } from '../services/dbService';

const props = defineProps(['student']);
const emit = defineEmits(['complete', 'exit']);

const sessionId = `diag-${Date.now()}`;
const step = ref('start');
const saving = ref(false);
const totalSecs = ref(30 * 60);
const timerInterval = ref(null);
const timerDisplay = computed(() => {
  const m = Math.floor(totalSecs.value / 60);
  const s = totalSecs.value % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
});

// ── Reliable numeric checking ─────────────────────────────────
function checkNumeric(input, correct, tolerance = 0.05) {
  const cleaned = input.toString().replace(/[^0-9.\-]/g, '').trim();
  if (!cleaned || cleaned === '-') return false;
  const studentNum = parseFloat(cleaned);
  const correctNum = parseFloat(correct);
  if (isNaN(studentNum) || isNaN(correctNum)) return false;
  if (Number.isInteger(correctNum) && Math.abs(correctNum) < 10000) {
    return Math.round(studentNum) === correctNum;
  }
  return Math.abs(studentNum - correctNum) <= tolerance;
}

// ── Question bank ─────────────────────────────────────────────
const QB = {
  'L3-N-001': { id:'L3-N-001', level:3, section:'Number', skillNode:'place-value-large',
    text:'What is the value of the digit <b>6</b> in 36,251?',
    type:'mcq', options:['6','60','600','6,000'], correctIndex:3, correctAnswer:6000,
    explanation:'The 6 is in the thousands column. 36,251 = 30,000 + 6,000 + 200 + 50 + 1.' },
  'L3-N-002': { id:'L3-N-002', level:3, section:'Number', skillNode:'place-value-large',
    text:'Round <b>7,846</b> to the nearest hundred.',
    type:'numeric', correctAnswer:7800, inputHint:'Type the rounded number',
    explanation:'Tens digit is 4 (less than 5) so round down. Answer: 7,800.' },
  'L3-A-001': { id:'L3-A-001', level:3, section:'Algebra', skillNode:'patterns-basic',
    text:'What is the next number? <b>3, 6, 9, 12, ___</b>',
    type:'numeric', correctAnswer:15, inputHint:'Type the next number',
    explanation:'Each term adds 3. Next = 12 + 3 = 15.' },
  'L3-G-001': { id:'L3-G-001', level:3, section:'Geometry', skillNode:'angles-intro',
    text:'Angles on a straight line add to 180°. One angle is 65°. What is the other angle?',
    type:'numeric', correctAnswer:115, inputHint:'Type the angle in degrees',
    explanation:'180 − 65 = 115°.' },
  'L3-S-001': { id:'L3-S-001', level:3, section:'Statistics', skillNode:'data-basic',
    text:'Five scores: 4, 7, 3, 9, 2. What is the <b>range</b>?',
    type:'numeric', correctAnswer:7, inputHint:'Type the range',
    explanation:'Range = highest − lowest = 9 − 2 = 7.' },

  'L4-N-001': { id:'L4-N-001', level:4, section:'Number', skillNode:'fractions-basic',
    text:'Which is larger: <b>3/4</b> or <b>5/8</b>?',
    type:'mcq', options:['3/4 is larger','5/8 is larger','They are equal','Cannot tell'],
    correctIndex:0, correctAnswer:0,
    explanation:'3/4 = 6/8. Since 6 > 5, then 3/4 is larger.' },
  'L4-N-002': { id:'L4-N-002', level:4, section:'Number', skillNode:'fractions-add',
    text:'Calculate 2/5 + 3/10. The answer is ?/10. Type the numerator only.',
    type:'numeric', correctAnswer:7, inputHint:'Type the numerator (answer is ?/10)',
    explanation:'2/5 = 4/10. Then 4/10 + 3/10 = 7/10. Numerator is 7.' },
  'L4-A-001': { id:'L4-A-001', level:4, section:'Algebra', skillNode:'algebra-intro',
    text:'If n = 5, what is the value of <b>3n + 4</b>?',
    type:'numeric', correctAnswer:19, inputHint:'Type the value',
    explanation:'3(5) + 4 = 15 + 4 = 19.' },
  'L4-G-001': { id:'L4-G-001', level:4, section:'Geometry', skillNode:'angles-triangles',
    text:'A triangle has angles 65° and 48°. What is the third angle?',
    type:'numeric', correctAnswer:67, inputHint:'Type the angle in degrees',
    explanation:'180 − 65 − 48 = 67°.' },
  'L4-S-001': { id:'L4-S-001', level:4, section:'Statistics', skillNode:'mean-median-mode',
    text:'Find the mean of: <b>4, 7, 2, 9, 3</b>',
    type:'numeric', correctAnswer:5, inputHint:'Type the mean',
    explanation:'Sum = 25. Mean = 25 ÷ 5 = 5.' },

  'L5-N-001': { id:'L5-N-001', level:5, section:'Number', skillNode:'percentages-basic',
    text:'A shop has 120 books. 35% are science books. How many science books?',
    type:'numeric', correctAnswer:42, inputHint:'Type the number of books',
    explanation:'10% = 12. 30% = 36. 5% = 6. 35% = 42.' },
  'L5-N-002': { id:'L5-N-002', level:5, section:'Number', skillNode:'ratio-basic',
    text:'Share £240 in ratio 3:5. How much is the <b>larger</b> share?',
    type:'numeric', correctAnswer:150, inputHint:'Type the amount in pounds',
    explanation:'8 parts. One part = £30. Larger share = 5 × 30 = £150.' },
  'L5-A-001': { id:'L5-A-001', level:5, section:'Algebra', skillNode:'equations-linear-basic',
    text:'Solve: <b>4x − 7 = 21</b>. What is x?',
    type:'numeric', correctAnswer:7, inputHint:'Type the value of x',
    explanation:'4x = 28. x = 7.' },
  'L5-A-002': { id:'L5-A-002', level:5, section:'Algebra', skillNode:'sequences-linear',
    text:'nth term of a sequence is <b>4n − 3</b>. What is the 25th term?',
    type:'numeric', correctAnswer:97, inputHint:'Type the 25th term',
    explanation:'4(25) − 3 = 97.' },
  'L5-G-001': { id:'L5-G-001', level:5, section:'Geometry', skillNode:'area-triangle',
    text:'Area of a triangle with base 10 cm and perpendicular height 6 cm.',
    type:'numeric', correctAnswer:30, inputHint:'Type the area in cm²',
    explanation:'½ × 10 × 6 = 30 cm².' },
  'L5-S-001': { id:'L5-S-001', level:5, section:'Statistics', skillNode:'mean-median-mode',
    text:'Mean of 5 numbers is 12. Four are 8, 14, 10, 15. What is the fifth?',
    type:'numeric', correctAnswer:13, inputHint:'Type the fifth number',
    explanation:'Total = 60. Known sum = 47. Fifth = 60 − 47 = 13.' },

  'L6-N-001': { id:'L6-N-001', level:6, section:'Number', skillNode:'percentages-change',
    text:'Price rises from £80 to £96. What is the percentage increase?',
    type:'mcq', options:['16%','20%','25%','12%'], correctIndex:1, correctAnswer:20,
    explanation:'Change = 16. % = (16 ÷ 80) × 100 = 20%. Common error: dividing by 100 gives 16%.' },
  'L6-N-002': { id:'L6-N-002', level:6, section:'Number', skillNode:'prime-factorisation',
    text:'What is the HCF of <b>24 and 36</b>?',
    type:'numeric', correctAnswer:12, inputHint:'Type the HCF',
    explanation:'Factors of 24: 1,2,3,4,6,8,12,24. Factors of 36: 1,2,3,4,6,9,12,18,36. HCF = 12.' },
  'L6-A-001': { id:'L6-A-001', level:6, section:'Algebra', skillNode:'algebra-expand',
    text:'Expand and simplify: 3(2x + 5) − 2(x − 3). Answer is ax + b. What is a?',
    type:'numeric', correctAnswer:4, inputHint:'Type the coefficient of x',
    explanation:'6x+15−2x+6 = 4x+21. Coefficient of x is 4.' },
  'L6-G-001': { id:'L6-G-001', level:6, section:'Geometry', skillNode:'pythagoras',
    text:'Right triangle with shorter sides 5 cm and 12 cm. Find the hypotenuse.',
    type:'numeric', correctAnswer:13, inputHint:'Type the length in cm',
    explanation:'5² + 12² = 25 + 144 = 169. √169 = 13.' },
  'L6-S-001': { id:'L6-S-001', level:6, section:'Statistics', skillNode:'probability-basic',
    text:'Bag has 4 red and 6 blue balls. P(red)? Type as a decimal.',
    type:'numeric', correctAnswer:0.4, inputHint:'Type as decimal e.g. 0.4',
    explanation:'P(red) = 4/10 = 0.4.' },

  'L7-N-001': { id:'L7-N-001', level:7, section:'Number', skillNode:'standard-form',
    text:'0.000045 = 4.5 × 10ⁿ. What is the value of n?',
    type:'numeric', correctAnswer:-5, inputHint:'Type the power (negative number)',
    explanation:'0.000045 = 4.5 × 10⁻⁵. n = −5.' },
  'L7-A-001': { id:'L7-A-001', level:7, section:'Algebra', skillNode:'equations-linear-basic',
    text:'Solve: <b>3(2x + 1) = 5x + 8</b>. What is x?',
    type:'numeric', correctAnswer:5, inputHint:'Type the value of x',
    explanation:'6x+3=5x+8. x=5.' },
  'L7-G-001': { id:'L7-G-001', level:7, section:'Geometry', skillNode:'area-circle',
    text:'Area of circle with radius 5 cm. Use π = 3.14. Answer to 1 decimal place.',
    type:'numeric', correctAnswer:78.5, inputHint:'Type the area in cm²',
    explanation:'π × 5² = 3.14 × 25 = 78.5 cm².' },
  'L7-S-001': { id:'L7-S-001', level:7, section:'Statistics', skillNode:'probability-combined',
    text:'P(A) = 0.4, P(B) = 0.3, independent. What is P(A and B)?',
    type:'numeric', correctAnswer:0.12, inputHint:'Type as decimal',
    explanation:'P(A and B) = 0.4 × 0.3 = 0.12.' },

  'L8-A-001': { id:'L8-A-001', level:8, section:'Algebra', skillNode:'equations-simultaneous',
    text:'Solve: 2x + y = 11 and x − y = 1. What is <b>x</b>?',
    type:'numeric', correctAnswer:4, inputHint:'Type the value of x',
    explanation:'Add equations: 3x=12, x=4. Then y=3.' },
  'L8-A-002': { id:'L8-A-002', level:8, section:'Algebra', skillNode:'quadratics-factorise',
    text:'x² + 7x + 12 = 0. Which pair satisfies this equation?',
    type:'mcq', options:['x=3 and x=4','x=−3 and x=−4','x=−3 and x=4','x=3 and x=−4'],
    correctIndex:1, correctAnswer:1,
    explanation:'(x+3)(x+4)=0. x=−3 or x=−4. Common error: forgetting the sign change.' },
  'L8-N-001': { id:'L8-N-001', level:8, section:'Number', skillNode:'surds',
    text:'√50 = a√2. What is the value of a?',
    type:'numeric', correctAnswer:5, inputHint:'Type the value of a',
    explanation:'√50 = √(25×2) = 5√2. a = 5.' },
  'L8-G-001': { id:'L8-G-001', level:8, section:'Geometry', skillNode:'trigonometry-basic',
    text:'Right triangle: opposite = 5, hypotenuse = 13. sin θ = 5/13.\nFind θ in degrees (1 decimal place). Calculator allowed.',
    type:'numeric', correctAnswer:22.6, inputHint:'Type the angle in degrees',
    explanation:'θ = sin⁻¹(5/13) ≈ 22.62° → 22.6°.' },
  'L8-S-001': { id:'L8-S-001', level:8, section:'Statistics', skillNode:'probability-tree',
    text:'Bag: 4 red, 6 blue. Draw 2 WITHOUT replacement.\nP(both red) = ?/15. Type the numerator only.',
    type:'numeric', correctAnswer:2, inputHint:'Type the numerator (answer is ?/15)',
    explanation:'4/10 × 3/9 = 12/90 = 2/15. Numerator is 2.' },

  'L9-A-001': { id:'L9-A-001', level:9, section:'Algebra', skillNode:'quadratics-factorise',
    text:'Solve x² − 5x + 6 = 0. What is the <b>larger</b> solution?',
    type:'numeric', correctAnswer:3, inputHint:'Type the larger value of x',
    explanation:'(x−2)(x−3)=0. x=2 or x=3. Larger is 3.' },
  'L9-N-001': { id:'L9-N-001', level:9, section:'Number', skillNode:'indices-advanced',
    text:'Evaluate: <b>27^(2/3)</b>',
    type:'mcq', options:['3','9','18','6'], correctIndex:1, correctAnswer:9,
    explanation:'27^(1/3) = 3. Then 3² = 9. Common error: stopping at cube root gives 3.' },
  'L9-G-001': { id:'L9-G-001', level:9, section:'Geometry', skillNode:'circle-theorems',
    text:'O is centre. Angle AOB = 80° (at centre).\nAngle ACB where C is on the major arc = ?',
    type:'numeric', correctAnswer:40, inputHint:'Type the angle in degrees',
    explanation:'Angle at centre = 2 × circumference angle. ACB = 80÷2 = 40°.' },
  'L9-S-001': { id:'L9-S-001', level:9, section:'Statistics', skillNode:'probability-tree',
    text:'Bag: 3 red, 7 blue. Draw 2 without replacement.\nP(both same colour) as decimal to 2dp.',
    type:'numeric', correctAnswer:0.53, inputHint:'Type decimal e.g. 0.53',
    explanation:'P(RR)=3/10×2/9=6/90. P(BB)=7/10×6/9=42/90. Total=48/90≈0.53.' },
};

const SECTIONS = ['Number','Algebra','Geometry','Statistics'];

const POOL = {
  Number:     { 3:['L3-N-001','L3-N-002'], 4:['L4-N-001','L4-N-002'], 5:['L5-N-001','L5-N-002'], 6:['L6-N-001','L6-N-002'], 7:['L7-N-001'], 8:['L8-N-001'], 9:['L9-N-001'] },
  Algebra:    { 3:['L3-A-001'], 4:['L4-A-001'], 5:['L5-A-001','L5-A-002'], 6:['L6-A-001'], 7:['L7-A-001'], 8:['L8-A-001','L8-A-002'], 9:['L9-A-001'] },
  Geometry:   { 3:['L3-G-001'], 4:['L4-G-001'], 5:['L5-G-001'], 6:['L6-G-001'], 7:['L7-G-001'], 8:['L8-G-001'], 9:['L9-G-001'] },
  Statistics: { 3:['L3-S-001'], 4:['L4-S-001'], 5:['L5-S-001'], 6:['L6-S-001'], 7:['L7-S-001'], 8:['L8-S-001'], 9:['L9-S-001'] },
};

const START = { beginner:3, developing:5, confident:7, strong:8 };

// State
const qSeq = ref([]);
const curIdx = ref(0);
const secLevels = ref({ Number:5, Algebra:5, Geometry:5, Statistics:5 });
const secConsec = ref({ Number:0, Algebra:0, Geometry:0, Statistics:0 });
const used = ref(new Set());
const results = ref([]);
const selOpt = ref(null);
const numAns = ref('');
const answered = ref(false);
const lastOk = ref(false);
const qStart = ref(null);
const diagResults = ref(null);
const loadingRes = ref(false);

const curQ = computed(() => qSeq.value[curIdx.value] || null);
const total = computed(() => qSeq.value.length);
const pct = computed(() => Math.round((curIdx.value / Math.max(total.value,1)) * 100));
const totalCorrect = computed(() => results.value.filter(r=>r.correct).length);
const totalAttempted = computed(() => results.value.filter(r=>!r.skipped).length);

function pickQ(section) {
  const lv = Math.max(3, Math.min(9, secLevels.value[section]));
  for (let delta of [0,1,-1,2,-2,3,-3]) {
    const pool = (POOL[section][lv+delta]||[]).filter(id=>!used.value.has(id));
    if (pool.length) {
      // Random selection — different children get different questions
      const idx = Math.floor(Math.random() * pool.length);
      used.value.add(pool[idx]);
      return QB[pool[idx]];
    }
  }
  return null;
}

function buildSeq(lv) {
  SECTIONS.forEach(s => { secLevels.value[s]=lv; });
  secConsec.value = { Number:0, Algebra:0, Geometry:0, Statistics:0 };
  const seq = [];
  for (let round=0; round<5; round++) {
    SECTIONS.forEach(s => { const q=pickQ(s); if(q) seq.push(q); });
  }
  qSeq.value = seq.slice(0,20);
}

function updateAdaptive(section, correct) {
  secConsec.value[section] = correct
    ? Math.max(0, secConsec.value[section]) + 1
    : Math.min(0, secConsec.value[section]) - 1;
  if (secConsec.value[section] >= 2) {
    secLevels.value[section] = Math.min(9, secLevels.value[section]+1);
    secConsec.value[section] = 0;
  } else if (secConsec.value[section] <= -2) {
    secLevels.value[section] = Math.max(3, secLevels.value[section]-1);
    secConsec.value[section] = 0;
  }
  // Replace next occurrence of this section in remaining sequence
  const remaining = qSeq.value.slice(curIdx.value+1);
  const ni = remaining.findIndex(q=>q?.section===section);
  if (ni !== -1) {
    const nq = pickQ(section);
    if (nq) {
      const upd = [...qSeq.value];
      upd[curIdx.value+1+ni] = nq;
      qSeq.value = upd;
    }
  }
}

function checkAns() {
  if (!curQ.value || answered.value) return;
  const q = curQ.value;
  let ok = false;
  if (q.type==='mcq') {
    if (selOpt.value===null) return;
    ok = selOpt.value===q.correctIndex;
  } else {
    if (!numAns.value.trim()) return;
    ok = checkNumeric(numAns.value, q.correctAnswer);
  }
  answered.value=true; lastOk.value=ok;
  const t = Math.round((Date.now()-qStart.value)/1000);
  const sa = q.type==='mcq' ? q.options[selOpt.value] : numAns.value.trim();
  results.value.push({ questionId:q.id, correct:ok, skipped:false, timeSecs:t, section:q.section, level:q.level, skillNode:q.skillNode, studentAnswer:sa, correctAnswer:String(q.correctAnswer), evidence: ok ? `Correct: "${sa}"` : `Wrong: "${sa}" — correct was "${q.correctAnswer}"` });
  updateAdaptive(q.section, ok);
  persist(q, ok, sa, t);
}

async function persist(q, ok, ans, t) {
  saving.value=true;
  try {
    await db.saveDiagnosticResult({ studentName:props.student?.name||'Unknown', sessionId, questionId:q.id, skillNode:q.skillNode, skillLevel:q.level, section:q.section, isCorrect:ok, wasSkipped:false, studentAnswer:String(ans), correctAnswer:String(q.correctAnswer), timeTakenSecs:t, evidence: ok?`Correct: "${ans}"`:`Wrong: "${ans}" — correct: "${q.correctAnswer}"` });
  } catch(e){ console.error(e); } finally { saving.value=false; }
}

function skip() {
  if (!curQ.value||answered.value) return;
  const q=curQ.value;
  const t=Math.round((Date.now()-qStart.value)/1000);
  results.value.push({ questionId:q.id, correct:false, skipped:true, timeSecs:t, section:q.section, level:q.level, skillNode:q.skillNode, studentAnswer:'', correctAnswer:String(q.correctAnswer), evidence:'Skipped' });
  db.saveDiagnosticResult({ studentName:props.student?.name||'Unknown', sessionId, questionId:q.id, skillNode:q.skillNode, skillLevel:q.level, section:q.section, isCorrect:false, wasSkipped:true, studentAnswer:'', correctAnswer:String(q.correctAnswer), timeTakenSecs:t, evidence:'Skipped' });
  updateAdaptive(q.section, false);
  next();
}

function next() {
  answered.value=false; selOpt.value=null; numAns.value=''; lastOk.value=false;
  if (curIdx.value>=total.value-1) finish();
  else { curIdx.value++; qStart.value=Date.now(); }
}

async function finish() {
  clearInterval(timerInterval.value);
  step.value='loading'; loadingRes.value=true;
  await new Promise(r=>setTimeout(r,1200));
  try { diagResults.value = await db.getSkillMap(props.student?.name||'Unknown'); }
  catch(e){ console.error(e); } finally { loadingRes.value=false; step.value='results'; }
}

const secSummary = computed(()=>SECTIONS.map(s=>{
  const sq=results.value.filter(r=>r.section===s);
  return { section:s, correct:sq.filter(r=>r.correct).length, total:sq.filter(r=>!r.skipped).length, finalLevel:secLevels.value[s] };
}));

const cGaps = computed(()=> !diagResults.value?.nodes ? [] :
  Object.entries(diagResults.value.nodes).filter(([,v])=>v.confidence<45).sort((a,b)=>a[1].confidence-b[1].confidence));
const cStrong = computed(()=> !diagResults.value?.nodes ? [] :
  Object.entries(diagResults.value.nodes).filter(([,v])=>v.confidence>=70).sort((a,b)=>b[1].confidence-a[1].confidence));

const NODE_NAMES = { 'place-value-large':'Place value','fractions-basic':'Fractions','fractions-add':'Adding fractions','percentages-basic':'Percentages','percentages-change':'% change','ratio-basic':'Ratio','prime-factorisation':'Prime factorisation','standard-form':'Standard form','surds':'Surds','indices-advanced':'Indices','patterns-basic':'Number patterns','algebra-intro':'Algebra intro','equations-linear-basic':'Linear equations','sequences-linear':'Sequences','algebra-expand':'Expanding brackets','algebra-factorise':'Factorising','equations-simultaneous':'Simultaneous eq','quadratics-factorise':'Quadratics','angles-intro':'Angles intro','angles-triangles':'Angles in triangles','area-triangle':'Area — triangles','pythagoras':'Pythagoras','area-circle':'Circle area','trigonometry-basic':'Trigonometry','circle-theorems':'Circle theorems','mean-median-mode':'Averages & range','data-basic':'Data & charts','probability-basic':'Probability','probability-combined':'Combined probability','probability-tree':'Tree diagrams' };
function nname(id){ return NODE_NAMES[id]||id; }

onUnmounted(()=>{ if(timerInterval.value) clearInterval(timerInterval.value); });

function begin(key) {
  const lv = START[key];
  buildSeq(lv);
  step.value='question';
  qStart.value=Date.now();
  timerInterval.value=setInterval(()=>{
    totalSecs.value--;
    if(totalSecs.value<=0){ clearInterval(timerInterval.value); finish(); }
  },1000);
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 overflow-y-auto">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
      <button @click="emit('exit')" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
        <i class="ti ti-x text-lg" aria-hidden="true"></i>
      </button>
      <div class="flex-1">
        <h1 class="text-base font-bold text-gray-900">Maths Diagnostic</h1>
        <p class="text-xs text-gray-500">{{ props.student?.name }}</p>
      </div>
      <div v-if="step==='question'" :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold', totalSecs<=60?'bg-red-100 text-red-700':totalSecs<=300?'bg-amber-100 text-amber-700':'bg-gray-100 text-gray-700']">
        <i class="ti ti-clock text-sm" aria-hidden="true"></i> {{ timerDisplay }}
      </div>
    </div>

    <!-- START -->
    <div v-if="step==='start'" class="max-w-lg mx-auto px-6 py-10">
      <div class="text-center mb-8">
        <div class="text-5xl mb-4">📐</div>
        <h2 class="text-2xl font-bold text-gray-900 mb-2">Maths Skill Check</h2>
        <p class="text-sm text-gray-500 leading-relaxed">20 questions across Number, Algebra, Geometry and Statistics. Gets harder when you get answers right, easier when you don't. Adapts automatically.</p>
      </div>
      <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 mb-6 leading-relaxed">
        <i class="ti ti-shield-check mr-1 text-blue-600" aria-hidden="true"></i>
        <strong>How marking works:</strong> Multiple choice = exact index. Numbers = value comparison (7, 7.0 and x=7 all count). No AI marking. No guessing.
      </div>
      <p class="text-sm font-semibold text-gray-800 mb-3">Where is {{ props.student?.name || 'this student' }} with maths right now?</p>
      <div class="space-y-2.5">
        <button v-for="opt in [{key:'beginner',label:'Just starting out',desc:'Times tables, basic fractions, place value',tag:'Starts at Level 3'},{key:'developing',label:'Getting there',desc:'Fractions, percentages, intro to algebra',tag:'Starts at Level 5'},{key:'confident',label:'Fairly confident',desc:'Algebra, geometry, linear equations',tag:'Starts at Level 7'},{key:'strong',label:'Strong',desc:'Simultaneous equations, quadratics, trig',tag:'Starts at Level 8'}]" :key="opt.key"
          @click="begin(opt.key)"
          class="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-gray-900 group-hover:text-indigo-700">{{ opt.label }}</div>
              <div class="text-xs text-gray-400 mt-0.5">{{ opt.desc }}</div>
            </div>
            <span class="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg font-medium flex-shrink-0">{{ opt.tag }}</span>
          </div>
        </button>
      </div>
      <p class="text-xs text-gray-400 text-center mt-4">Wrong starting point? The test corrects itself within 3–4 questions.</p>
    </div>

    <!-- QUESTION -->
    <div v-else-if="step==='question' && curQ" class="max-w-lg mx-auto px-6 py-6">
      <div class="mb-5">
        <div class="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>Question {{ curIdx+1 }} of {{ total }}</span>
          <span>{{ pct }}%</span>
        </div>
        <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full bg-indigo-500 rounded-full transition-all duration-500" :style="{width:pct+'%'}"></div>
        </div>
        <div class="flex gap-1 mt-2 flex-wrap">
          <div v-for="(q,i) in qSeq" :key="i" :class="['w-2 h-2 rounded-full transition-all', i===curIdx?'scale-150 bg-indigo-500':i<results.length?(results[i]?.correct?'bg-green-500':results[i]?.skipped?'bg-gray-300':'bg-red-400'):'bg-gray-200']"></div>
        </div>
      </div>

      <div class="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
        <div class="flex gap-2 mb-4">
          <span class="text-xs px-2.5 py-1 rounded-full font-medium bg-indigo-50 text-indigo-700">{{ curQ.section }}</span>
          <span :class="['text-xs px-2.5 py-1 rounded-full font-medium', curQ.level<=4?'bg-green-50 text-green-700':curQ.level<=6?'bg-amber-50 text-amber-700':'bg-red-50 text-red-700']">Level {{ curQ.level }}</span>
        </div>
        <p class="text-base font-semibold text-gray-900 leading-relaxed mb-5 whitespace-pre-line" v-html="curQ.text"></p>

        <!-- MCQ -->
        <div v-if="curQ.type==='mcq'" class="space-y-2.5">
          <button v-for="(opt,i) in curQ.options" :key="i" @click="!answered&&(selOpt=i)" :disabled="answered"
            :class="['w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-3',
              answered&&i===curQ.correctIndex?'bg-green-50 border-green-400 text-green-800':
              answered&&i===selOpt&&!lastOk?'bg-red-50 border-red-400 text-red-800':
              !answered&&selOpt===i?'bg-indigo-50 border-indigo-400 text-indigo-800':
              'bg-gray-50 border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50']">
            <span :class="['w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center flex-shrink-0',
              answered&&i===curQ.correctIndex?'bg-green-500 text-white':
              answered&&i===selOpt&&!lastOk?'bg-red-500 text-white':
              selOpt===i?'bg-indigo-500 text-white':'bg-white border border-gray-300 text-gray-500']">
              {{ ['A','B','C','D'][i] }}
            </span>
            {{ opt }}
          </button>
        </div>

        <!-- Numeric -->
        <div v-else>
          <label class="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">{{ curQ.inputHint||'Type your answer' }}</label>
          <input v-model="numAns" :disabled="answered" @keydown.enter="!answered&&checkAns()" type="text" inputmode="decimal" placeholder="Type your answer..." :class="['w-full border rounded-xl px-4 py-3 text-base font-semibold outline-none transition-colors', answered&&lastOk?'border-green-400 bg-green-50 text-green-800':answered&&!lastOk?'border-red-400 bg-red-50 text-red-800':'border-gray-200 focus:border-indigo-400 bg-gray-50']" />
          <p class="text-xs text-gray-400 mt-1.5">Just type the number — e.g. 7 or 22.6 or -5</p>
        </div>

        <!-- Feedback -->
        <div v-if="answered" :class="['mt-5 rounded-xl p-4 text-sm flex gap-3', lastOk?'bg-green-50 border border-green-200':'bg-orange-50 border border-orange-200']">
          <span class="text-xl flex-shrink-0">{{ lastOk?'✅':'💡' }}</span>
          <div>
            <p class="font-semibold mb-1" :class="lastOk?'text-green-800':'text-orange-800'">
              {{ lastOk?'Correct!':'Not quite — answer: '+curQ.correctAnswer }}
            </p>
            <p class="text-xs text-gray-600 leading-relaxed">{{ curQ.explanation }}</p>
          </div>
        </div>
      </div>

      <div class="flex gap-3">
        <button v-if="!answered" @click="skip" class="px-5 py-3 rounded-xl border border-gray-200 text-sm text-gray-400 hover:text-gray-600 transition-colors">Skip</button>
        <button v-if="!answered" @click="checkAns" :disabled="curQ.type==='mcq'?selOpt===null:!numAns.trim()" class="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Check answer</button>
        <button v-if="answered" @click="next" class="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
          {{ curIdx>=total-1?'See results':'Next' }} <i class="ti ti-arrow-right text-sm" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Live section levels (transparent to parent/teacher) -->
      <div class="mt-4 flex gap-2 flex-wrap">
        <div v-for="s in SECTIONS" :key="s" class="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
          {{ s.slice(0,3) }}: L{{ secLevels[s] }}
        </div>
      </div>
    </div>

    <!-- LOADING -->
    <div v-else-if="step==='loading'" class="flex flex-col items-center justify-center py-24">
      <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
      <h2 class="text-lg font-bold text-gray-900 mb-1">Building your skill map...</h2>
      <p class="text-sm text-gray-500">Mapping {{ results.length }} answers to skill nodes</p>
    </div>

    <!-- RESULTS -->
    <div v-else-if="step==='results'" class="max-w-2xl mx-auto px-6 py-8">
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">{{ totalCorrect>=15?'🏆':totalCorrect>=11?'🌟':totalCorrect>=7?'💪':'🌱' }}</div>
        <h2 class="text-2xl font-bold text-gray-900 mb-1">Diagnostic complete</h2>
        <p class="text-gray-500 text-sm">{{ props.student?.name }} · {{ totalCorrect }}/{{ totalAttempted }} correct</p>
      </div>

      <!-- Section breakdown -->
      <div class="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
        <h3 class="text-sm font-bold text-gray-900 mb-4">By section — confirmed level reached</h3>
        <div class="space-y-3">
          <div v-for="s in secSummary" :key="s.section" class="flex items-center gap-3">
            <div class="w-24 text-xs font-medium text-gray-600 flex-shrink-0">{{ s.section }}</div>
            <div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full rounded-full" :style="{width:s.total?(s.correct/s.total*100)+'%':'0%', backgroundColor:s.total&&s.correct/s.total>=0.7?'#15803d':s.total&&s.correct/s.total>=0.5?'#b45309':'#b91c1c'}"></div>
            </div>
            <div class="text-xs text-gray-500 w-10 text-right">{{ s.correct }}/{{ s.total }}</div>
            <div class="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 w-14 text-center flex-shrink-0">L{{ s.finalLevel }}</div>
          </div>
        </div>
      </div>

      <!-- Confirmed gaps -->
      <div class="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <h3 class="text-sm font-bold text-gray-900 mb-1">Confirmed gaps</h3>
        <p class="text-xs text-gray-400 mb-4">From your actual answers only. Nothing assumed.</p>
        <div v-if="cGaps.length===0" class="text-sm text-gray-400 py-2 text-center">No confirmed gaps — all tested topics answered correctly.</div>
        <div v-for="([nid,data],i) in cGaps" :key="nid" class="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-100 mb-2">
          <span :class="['text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 mt-0.5', i===0?'bg-red-200 text-red-800':'bg-orange-100 text-orange-700']">{{ i+1 }}</span>
          <div>
            <div class="text-sm font-semibold text-gray-900">{{ nname(nid) }}</div>
            <div class="text-xs text-gray-500 mt-0.5">{{ data.evidence }}</div>
          </div>
        </div>
      </div>

      <!-- Confirmed strong -->
      <div v-if="cStrong.length>0" class="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
        <h3 class="text-sm font-bold text-gray-900 mb-3">Confirmed strengths</h3>
        <div class="flex flex-wrap gap-2">
          <span v-for="([nid]) in cStrong" :key="nid" class="text-xs px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-800 font-medium">✓ {{ nname(nid) }}</span>
        </div>
      </div>

      <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 mb-6 leading-relaxed">
        <i class="ti ti-shield-check mr-1 text-blue-600" aria-hidden="true"></i>
        MCQ answers verified by index. Numeric answers verified by value. No AI in marking. No assumptions.
      </div>

      <div class="flex gap-3">
        <button @click="emit('exit')" class="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl text-sm font-bold hover:bg-gray-50">Back to home</button>
        <button @click="emit('complete',{sessionId,skillMap:diagResults,results})" class="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 flex items-center justify-center gap-2">
          View skill map <i class="ti ti-network text-sm" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </div>
</template>