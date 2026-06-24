/**
 * practiceEngine.ts — Tier-1 parameterised question generator.
 *
 * Each skill node has a template that RANDOMISES the numbers and COMPUTES the
 * answer in code — never AI, never a stored key. This guarantees:
 *   • 100% correct answers (the answer is derived, not asserted)
 *   • infinite variety (new numbers every time)
 *   • instant, zero-cost, offline
 *   • deterministic marking (numeric tolerance / MCQ index) — same trust model
 *     as the diagnostic. No AI marking, ever.
 *
 * Nodes without a template return null; the caller falls back to topic learning.
 */

export interface PracticeQuestion {
  node: string;
  text: string;            // may contain simple <b> tags
  type: 'numeric' | 'mcq';
  correctAnswer: number;   // numeric value, or correct option index for mcq
  options?: string[];
  inputHint?: string;
  explanation: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const choice = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25]];

function mcq(correctVal: string, distractors: string[]): { options: string[]; correctIndex: number } {
  const opts = [correctVal, ...distractors];
  // shuffle
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { options: opts, correctIndex: opts.indexOf(correctVal) };
}

// ── templates ─────────────────────────────────────────────────────────────────
type Gen = () => Omit<PracticeQuestion, 'node'>;

const TEMPLATES: Record<string, Gen> = {
  // ── Number ──
  'place-value-large': () => {
    const places = [[1, 'units'], [10, 'tens'], [100, 'hundreds'], [1000, 'thousands'], [10000, 'ten-thousands']] as const;
    const [val, name] = choice(places.slice(1));
    const digit = ri(1, 9);
    const n = ri(1, 9) * 100000 + digit * val + ri(0, val - 1);
    return { text: `What is the value of the digit <b>${digit}</b> in the ${name} place of ${n.toLocaleString()}?`, type: 'numeric', correctAnswer: digit * val, inputHint: 'Type the value', explanation: `The ${digit} is in the ${name} column, so its value is ${digit} × ${val} = ${digit * val}.` };
  },
  'multiplication-basic': () => {
    const a = ri(3, 12), b = ri(3, 12);
    return { text: `Calculate: <b>${a} × ${b}</b>`, type: 'numeric', correctAnswer: a * b, inputHint: 'Type the answer', explanation: `${a} × ${b} = ${a * b}.` };
  },
  'factors-multiples': () => {
    const n = choice([12, 18, 24, 16, 20, 28, 36, 30, 40, 48]);
    let count = 0; for (let i = 1; i <= n; i++) if (n % i === 0) count++;
    return { text: `How many factors does <b>${n}</b> have?`, type: 'numeric', correctAnswer: count, inputHint: 'Type the number of factors', explanation: `Factors of ${n} are the numbers that divide it exactly — there are ${count} of them (remember to include 1 and ${n}).` };
  },
  'fractions-basic': () => {
    const k = ri(2, 6); const num = ri(2, 5), den = num + ri(1, 4);
    const a = num * k, b = den * k; const g = gcd(a, b);
    return { text: `Simplify <b>${a}/${b}</b>. Type the numerator of the simplified fraction.`, type: 'numeric', correctAnswer: a / g, inputHint: `Type numerator (answer is ?/${b / g})`, explanation: `HCF(${a},${b}) = ${g}. ${a}÷${g} = ${a / g}, ${b}÷${g} = ${b / g}. So ${a}/${b} = ${a / g}/${b / g}.` };
  },
  'fractions-add': () => {
    const d = choice([8, 10, 12, 6, 9]); const x = ri(1, d - 2), y = ri(1, d - x - 1);
    return { text: `Calculate <b>${x}/${d} + ${y}/${d}</b>. Type the numerator (answer is ?/${d}).`, type: 'numeric', correctAnswer: x + y, inputHint: `Type numerator (answer is ?/${d})`, explanation: `Same denominator, so add numerators: ${x} + ${y} = ${x + y}. Answer ${x + y}/${d}.` };
  },
  'decimals-basic': () => {
    const d = ri(1, 9);
    return { text: `Write <b>0.${d}</b> as a fraction with denominator 10. Type the numerator.`, type: 'numeric', correctAnswer: d, inputHint: 'Type the numerator (answer is ?/10)', explanation: `0.${d} means ${d} tenths = ${d}/10.` };
  },
  'percentages-basic': () => {
    const pct = choice([10, 15, 20, 25, 30, 40, 50]); const base = choice([40, 60, 80, 120, 200, 160, 240]);
    return { text: `Find <b>${pct}% of £${base}</b>.`, type: 'numeric', correctAnswer: (pct * base) / 100, inputHint: 'Type the amount in pounds', explanation: `${pct}% of ${base} = ${pct}/100 × ${base} = £${(pct * base) / 100}.` };
  },
  'percentages-change': () => {
    const base = choice([40, 50, 80, 200, 120, 60]); const pct = choice([10, 20, 25, 50]);
    const up = Math.random() < 0.5; const amt = (pct * base) / 100; const now = up ? base + amt : base - amt;
    return { text: `A price ${up ? 'rises' : 'falls'} from £${base} to £${now}. What is the percentage ${up ? 'increase' : 'decrease'}?`, type: 'numeric', correctAnswer: pct, inputHint: 'Type the percentage (no % sign)', explanation: `Change = ${amt}. % = (${amt} ÷ ${base}) × 100 = ${pct}%. Always divide by the ORIGINAL value.` };
  },
  'ratio-basic': () => {
    const a = ri(2, 5), b = ri(2, 5); const part = choice([20, 30, 40, 50]); const total = (a + b) * part;
    return { text: `Share £${total} in the ratio <b>${a}:${b}</b>. How much is the larger share?`, type: 'numeric', correctAnswer: Math.max(a, b) * part, inputHint: 'Type the amount in pounds', explanation: `${a + b} parts total. One part = ${total} ÷ ${a + b} = £${part}. Larger share = ${Math.max(a, b)} × ${part} = £${Math.max(a, b) * part}.` };
  },
  'prime-factorisation': () => {
    const g = choice([4, 6, 8, 12]); const a = g * choice([2, 3, 5]), b = g * choice([7, 11]);
    return { text: `What is the HCF (highest common factor) of <b>${a} and ${b}</b>?`, type: 'numeric', correctAnswer: gcd(a, b), inputHint: 'Type the HCF', explanation: `The largest number dividing both ${a} and ${b} exactly is ${gcd(a, b)}.` };
  },
  'indices-basic': () => {
    const base = ri(2, 5), m = ri(2, 3), n = ri(2, 3);
    return { text: `Simplify <b>${base}<sup>${m}</sup> × ${base}<sup>${n}</sup></b> as a single power. Type the new exponent.`, type: 'numeric', correctAnswer: m + n, inputHint: 'Type the exponent', explanation: `Same base — add the powers: ${m} + ${n} = ${m + n}, giving ${base}^${m + n}.` };
  },
  'indices-advanced': () => {
    const root = choice([[8, 3], [27, 3], [16, 2], [25, 2], [64, 3], [81, 2]]); const [val, n] = root;
    const ans = Math.round(Math.pow(val, 1 / n));
    return { text: `Evaluate <b>${val}<sup>1/${n}</sup></b>.`, type: 'numeric', correctAnswer: ans, inputHint: 'Type the value', explanation: `${val}^(1/${n}) is the ${n === 2 ? 'square' : 'cube'} root of ${val} = ${ans}, because ${ans}^${n} = ${val}.` };
  },
  'standard-form': () => {
    const mant = ri(1, 9) + ri(1, 9) / 10; const p = ri(3, 5); const ord = Math.round(mant * Math.pow(10, p));
    return { text: `Write <b>${mant} × 10<sup>${p}</sup></b> as an ordinary number.`, type: 'numeric', correctAnswer: ord, inputHint: 'Type the ordinary number', explanation: `Move the decimal point ${p} places right: ${mant} × 10^${p} = ${ord}.` };
  },
  'surds': () => {
    const k = ri(2, 6), r = choice([2, 3, 5, 7]); const inside = k * k * r;
    return { text: `Simplify <b>√${inside}</b> into the form a√${r}. What is a?`, type: 'numeric', correctAnswer: k, inputHint: 'Type the value of a', explanation: `√${inside} = √(${k * k} × ${r}) = √${k * k} × √${r} = ${k}√${r}. So a = ${k}.` };
  },

  // ── Algebra ──
  'patterns-basic': () => {
    const start = ri(1, 6), d = ri(2, 5), k = ri(6, 10); const term = start + (k - 1) * d;
    return { text: `A sequence starts ${start}, ${start + d}, ${start + 2 * d}, … (adding ${d} each time). What is the ${k}th term?`, type: 'numeric', correctAnswer: term, inputHint: `Type the ${k}th term`, explanation: `${k}th term = ${start} + (${k} − 1) × ${d} = ${start} + ${(k - 1) * d} = ${term}.` };
  },
  'algebra-intro': () => {
    const x = ri(2, 6), m = ri(2, 5), c = ri(1, 9);
    return { text: `If x = ${x}, find the value of <b>${m}x + ${c}</b>.`, type: 'numeric', correctAnswer: m * x + c, inputHint: 'Type the value', explanation: `${m}(${x}) + ${c} = ${m * x} + ${c} = ${m * x + c}.` };
  },
  'equations-linear-basic': () => {
    const x = ri(2, 9), a = ri(2, 6), b = ri(1, 12); const c = a * x + b;
    return { text: `Solve: <b>${a}x + ${b} = ${c}</b>. What is x?`, type: 'numeric', correctAnswer: x, inputHint: 'Type the value of x', explanation: `${a}x = ${c} − ${b} = ${a * x}. x = ${a * x} ÷ ${a} = ${x}.` };
  },
  'sequences-linear': () => {
    const a = ri(2, 6), b = ri(-3, 6), k = ri(5, 12); const term = a * k + b;
    return { text: `A sequence has nth term <b>${a}n ${b < 0 ? '− ' + -b : '+ ' + b}</b>. Find the ${k}th term.`, type: 'numeric', correctAnswer: term, inputHint: `Type the ${k}th term`, explanation: `${a}(${k}) ${b < 0 ? '− ' + -b : '+ ' + b} = ${a * k} ${b < 0 ? '− ' + -b : '+ ' + b} = ${term}.` };
  },
  'algebra-expand': () => {
    const p = ri(1, 6), q = ri(1, 6);
    return { text: `Expand <b>(x + ${p})(x + ${q})</b> into x² + bx + ${p * q}. What is b?`, type: 'numeric', correctAnswer: p + q, inputHint: 'Type the value of b', explanation: `(x+${p})(x+${q}) = x² + ${p}x + ${q}x + ${p * q} = x² + ${p + q}x + ${p * q}. b = ${p + q}.` };
  },
  'algebra-factorise': () => {
    const p = ri(1, 6), q = ri(1, 6); const b = p + q, c = p * q;
    return { text: `Factorise <b>x² + ${b}x + ${c}</b> as (x + p)(x + q). What is the larger of p and q?`, type: 'numeric', correctAnswer: Math.max(p, q), inputHint: 'Type the larger value', explanation: `Two numbers multiplying to ${c} and adding to ${b}: ${p} and ${q}. Larger is ${Math.max(p, q)}.` };
  },
  'equations-simultaneous': () => {
    const x = ri(1, 6), y = ri(1, 6); // 2x + y = s1 ; x - y = s2
    const s1 = 2 * x + y, s2 = x - y;
    return { text: `Solve: <b>2x + y = ${s1}</b> and <b>x − y = ${s2}</b>. What is x?`, type: 'numeric', correctAnswer: x, inputHint: 'Type the value of x', explanation: `Add the equations: 3x = ${s1 + s2}, so x = ${x}. (Then y = ${y}.)` };
  },
  'quadratics-factorise': () => {
    const r1 = ri(1, 5), r2 = ri(1, 5); const b = -(r1 + r2), c = r1 * r2;
    return { text: `Solve <b>x² ${b < 0 ? '− ' + -b : '+ ' + b}x + ${c} = 0</b>. What is the larger solution?`, type: 'numeric', correctAnswer: Math.max(r1, r2), inputHint: 'Type the larger value of x', explanation: `Factorises to (x − ${r1})(x − ${r2}) = 0, so x = ${r1} or ${r2}. Larger is ${Math.max(r1, r2)}.` };
  },

  // ── Geometry ──
  'angles-triangles': () => {
    const a = ri(40, 80), b = ri(30, 70);
    return { text: `A triangle has angles ${a}° and ${b}°. What is the third angle?`, type: 'numeric', correctAnswer: 180 - a - b, inputHint: 'Type the angle in degrees', explanation: `Angles in a triangle sum to 180°. 180 − ${a} − ${b} = ${180 - a - b}°.` };
  },
  'area-basic': () => {
    const l = ri(4, 15), w = ri(3, 12);
    return { text: `A rectangle is ${l} cm by ${w} cm. What is its area?`, type: 'numeric', correctAnswer: l * w, inputHint: 'Type the area in cm²', explanation: `Area = length × width = ${l} × ${w} = ${l * w} cm².` };
  },
  'perimeter-basic': () => {
    const l = ri(4, 15), w = ri(3, 12);
    return { text: `A rectangle is ${l} cm long and ${w} cm wide. What is its perimeter?`, type: 'numeric', correctAnswer: 2 * (l + w), inputHint: 'Type the perimeter in cm', explanation: `Perimeter = 2 × (${l} + ${w}) = ${2 * (l + w)} cm.` };
  },
  'area-triangle': () => {
    const b = choice([4, 6, 8, 10, 12]), h = choice([4, 6, 8, 10]);
    return { text: `A triangle has base ${b} cm and perpendicular height ${h} cm. What is its area?`, type: 'numeric', correctAnswer: (b * h) / 2, inputHint: 'Type the area in cm²', explanation: `Area = ½ × base × height = ½ × ${b} × ${h} = ${(b * h) / 2} cm².` };
  },
  'pythagoras': () => {
    const [a, b, c] = choice(TRIPLES); const findHyp = Math.random() < 0.6;
    return findHyp
      ? { text: `A right-angled triangle has shorter sides ${a} cm and ${b} cm. Find the hypotenuse.`, type: 'numeric', correctAnswer: c, inputHint: 'Type the length in cm', explanation: `${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}. √${c * c} = ${c} cm.` }
      : { text: `A right-angled triangle has hypotenuse ${c} cm and one side ${a} cm. Find the other side.`, type: 'numeric', correctAnswer: b, inputHint: 'Type the length in cm', explanation: `${c}² − ${a}² = ${c * c} − ${a * a} = ${b * b}. √${b * b} = ${b} cm.` };
  },
  'area-circle': () => {
    const r = ri(2, 10);
    return { text: `Find the circumference of a circle with radius ${r} cm. Use π = 3.14, answer to 1 d.p.`, type: 'numeric', correctAnswer: Math.round(2 * 3.14 * r * 10) / 10, inputHint: 'Type the circumference in cm', explanation: `C = 2πr = 2 × 3.14 × ${r} = ${Math.round(2 * 3.14 * r * 10) / 10} cm.` };
  },
  'volume-basic': () => {
    const l = ri(2, 8), w = ri(2, 6), h = ri(2, 6);
    return { text: `A cuboid is ${l} cm × ${w} cm × ${h} cm. What is its volume?`, type: 'numeric', correctAnswer: l * w * h, inputHint: 'Type the volume in cm³', explanation: `Volume = ${l} × ${w} × ${h} = ${l * w * h} cm³.` };
  },
  'circle-theorems': () => {
    const centre = ri(20, 80) * 2; // even so half is integer
    return { text: `O is the centre of a circle. The angle at the centre AOB = ${centre}°. What is the angle ACB at the circumference (C on the major arc)?`, type: 'numeric', correctAnswer: centre / 2, inputHint: 'Type the angle in degrees', explanation: `The angle at the centre is twice the angle at the circumference: ${centre} ÷ 2 = ${centre / 2}°.` };
  },

  // ── Statistics ──
  'data-basic': () => {
    const nums = Array.from({ length: 5 }, () => ri(1, 20)); const r = Math.max(...nums) - Math.min(...nums);
    return { text: `Find the range of: <b>${nums.join(', ')}</b>`, type: 'numeric', correctAnswer: r, inputHint: 'Type the range', explanation: `Range = highest − lowest = ${Math.max(...nums)} − ${Math.min(...nums)} = ${r}.` };
  },
  'mean-median-mode': () => {
    const n = 5; const mean = ri(4, 12); const nums: number[] = [];
    let sum = 0; for (let i = 0; i < n - 1; i++) { const v = ri(1, 2 * mean); nums.push(v); sum += v; }
    const last = n * mean - sum;
    if (last < 0 || last > 30) return TEMPLATES['mean-median-mode'](); // resample
    nums.push(last);
    return { text: `Find the mean of: <b>${nums.join(', ')}</b>`, type: 'numeric', correctAnswer: mean, inputHint: 'Type the mean', explanation: `Sum = ${nums.reduce((a, b) => a + b, 0)}. Mean = ${nums.reduce((a, b) => a + b, 0)} ÷ ${n} = ${mean}.` };
  },
  'probability-basic': () => {
    const total = choice([10, 20, 5, 4]); const fav = ri(1, total - 1);
    return { text: `A bag has ${total} balls; ${fav} are red. What is P(red) as a decimal?`, type: 'numeric', correctAnswer: Math.round((fav / total) * 100) / 100, inputHint: 'Type as a decimal', explanation: `P(red) = ${fav}/${total} = ${Math.round((fav / total) * 100) / 100}.` };
  },
  'probability-combined': () => {
    const pa = choice([0.2, 0.4, 0.5, 0.3]); const pb = choice([0.2, 0.5, 0.4, 0.3]);
    return { text: `Events A and B are independent. P(A) = ${pa}, P(B) = ${pb}. Find P(A and B).`, type: 'numeric', correctAnswer: Math.round(pa * pb * 100) / 100, inputHint: 'Type as a decimal', explanation: `Independent events: P(A and B) = ${pa} × ${pb} = ${Math.round(pa * pb * 100) / 100}.` };
  },
};

export function hasTemplate(node: string): boolean {
  return node in TEMPLATES;
}

export function generate(node: string): PracticeQuestion | null {
  const t = TEMPLATES[node];
  if (!t) return null;
  return { node, ...t() };
}

const NUM_TOLERANCE = 0.05;

/** Deterministic marking — numeric value or MCQ index. No AI. */
export function mark(q: PracticeQuestion, answer: string | number): boolean {
  if (q.type === 'mcq') return Number(answer) === q.correctAnswer;
  const cleaned = String(answer).replace(/[^0-9.\-]/g, '').trim();
  if (!cleaned || cleaned === '-') return false;
  const s = parseFloat(cleaned), c = Number(q.correctAnswer);
  if (isNaN(s)) return false;
  if (Number.isInteger(c) && Math.abs(c) < 10000) return Math.round(s) === c;
  return Math.abs(s - c) <= NUM_TOLERANCE;
}
