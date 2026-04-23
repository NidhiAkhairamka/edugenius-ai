<script setup>
const emit = defineEmits(['back']);

const features = [
  {
    id: 'dashboard',
    icon: '🏠',
    title: 'Dashboard',
    color: 'from-indigo-500 to-violet-600',
    badge: 'Start Here',
    steps: [
      'Choose Maths or Science at the top to switch subjects.',
      'Tap any topic to open its Learning Arena.',
      'Topics show your mastery % — green star means completed.',
      'Add a custom topic using the + button for anything your school covers that\'s not in the list.',
      'The Mock Exam shortcut takes you straight to paper generation.'
    ]
  },
  {
    id: 'briefing',
    icon: '📖',
    title: 'Topic Briefing',
    color: 'from-emerald-500 to-teal-600',
    badge: 'Learn First',
    steps: [
      'Concept tab: AI-generated overview of the topic, written for your year group. Includes a Logic Flow — the exact steps to follow in exam questions.',
      'Flashcards tab: Tap any card to flip it. Use these for quick revision. If you\'ve uploaded notes, flashcards include your teacher\'s specific examples.',
      'Cheat Sheet tab: All key formulas and common mistakes in one place. The Pro Tip is an exam-specific technique for this topic.',
      'My Notes tab: Upload your handwritten notes or printed PDF/photo. Your notes are COMBINED with the curriculum — not instead of it. Questions then reflect what your teacher taught.',
      'Ask button (green): Open the Topic Tutor to ask anything about the topic. It can explain concepts, give examples, and clarify formulas.'
    ]
  },
  {
    id: 'practice',
    icon: '⚡',
    title: 'Practice Arena',
    color: 'from-amber-500 to-orange-500',
    badge: 'Build Skills',
    steps: [
      'Questions adapt to your performance. Get 3 right in a row → harder questions. Get 2 wrong → easier questions. This is adaptive difficulty.',
      'Questions are grounded in your notes if uploaded, or the standard curriculum if not. No two sessions give the same questions.',
      'MCQ questions: tap an option. Open questions: type your explanation in the text box.',
      'Need a Hint? button: Opens the Question Tutor (Socrates) which guides you with questions — it never just gives the answer. Only available in Practice, not Test.',
      'After answering, you see whether you were right, specific feedback, and what to improve.',
      'Progress bar: reach 50% to unlock the Mastery Test. Reach 100% and it triggers automatically.'
    ]
  },
  {
    id: 'test',
    icon: '⭐',
    title: 'Mastery Test',
    color: 'from-rose-500 to-pink-600',
    badge: 'Unlock at 50%',
    steps: [
      'Unlocked after reaching 50% in Practice. Click the Test tab when it\'s available (no lock icon).',
      'Questions are more rigorous than Practice — exam-standard difficulty. No hints available during Test.',
      'Pass the test to mark this topic as Mastered (⭐). This updates your Progress page.',
      'If you don\'t pass, keep practising and try again. The test can be retaken.'
    ]
  },
  {
    id: 'topic-tutor',
    icon: '📚',
    title: 'Topic Tutor (Briefing)',
    color: 'from-emerald-500 to-green-600',
    badge: 'Ask Anything',
    steps: [
      'Tap the green Ask button in the Briefing → Concept tab.',
      'Ask anything about the topic: "What is SOH CAH TOA?", "Can you explain step 3?", "What formula do I use for this?"',
      'Unlike the Practice hint, this tutor CAN give full explanations and definitions. It knows all your flashcards, formulas, and logic steps.',
      'Start a new topic doubt any time — the chat stays open as you browse the briefing tabs.'
    ]
  },
  {
    id: 'hint-tutor',
    icon: '💡',
    title: 'Question Hint (Practice)',
    color: 'from-indigo-500 to-blue-600',
    badge: 'Guided Hints',
    steps: [
      'Tap "Need a hint?" during a Practice question.',
      'Tell Socrates where you\'re stuck: "I don\'t know which formula to use" or "I got 7 but the answer should be different".',
      'Socrates NEVER gives the answer. It asks you questions that point you in the right direction.',
      'The hint panel shows your current question at the top so Socrates knows exactly what you\'re working on.',
      'Not available during the Mastery Test — that\'s exam conditions.'
    ]
  },
  {
    id: 'mock',
    icon: '📝',
    title: 'Mock Exam',
    color: 'from-slate-700 to-slate-900',
    badge: 'Full Papers',
    steps: [
      'Step 1 (optional): Upload last term\'s school paper. The AI reads the FORMAT only — question style, marking scheme, timing — not the topics. Skip this if you don\'t have one.',
      'Step 2: Choose which topics to include. You can select 1 topic, a few, or all of Year 9 Maths. Also includes any custom topics you\'ve added.',
      'Step 3: Set total marks and time. Smart defaults are calculated from the paper if uploaded.',
      'Attempt on Screen: timed exam, type answers, AI marks instantly when you submit.',
      'Print & Write: print the paper, answer by hand, upload a photo — AI reads your handwriting and marks each question.',
      'Review: see your grade, topic-by-topic scores, model answers, examiner feedback, and an action plan for weak topics.'
    ]
  },
  {
    id: 'notes',
    icon: '📎',
    title: 'Uploading Notes',
    color: 'from-violet-500 to-purple-600',
    badge: 'Personalise',
    steps: [
      'Best formats: PDF (export from PowerPoint: File → Save As → PDF), or a clear photo of handwritten notes (JPG/PNG).',
      'PowerPoint files cannot be uploaded directly — export as PDF first.',
      'Handwritten notes work well if: good lighting, photo taken from directly above, dark pen on white paper, one page per photo.',
      'Each topic has its own notes. Notes uploaded in Trigonometry only affect Trigonometry — not Linear Equations.',
      'Your notes are COMBINED with the standard curriculum — the curriculum keeps accuracy, your notes add your teacher\'s specific examples and phrasing.',
      'After uploading, the briefing content and flashcards update within 30 seconds to reflect your notes.'
    ]
  },
  {
    id: 'progress',
    icon: '📈',
    title: 'Progress Page',
    color: 'from-blue-500 to-cyan-600',
    badge: 'Track Growth',
    steps: [
      'Student view: skill bars (Calculation, Theory, Application, Persistence) calculated from your actual question logs.',
      '30-day activity graph: green = high accuracy days, amber = medium, rose = low accuracy. Use this to spot revision gaps.',
      'Topic heatmap: all Year 9 topics colour-coded. ⭐ Mastered · ✅ Good · ⚠️ Struggling · ▶️ Started · ○ Not started.',
      'Mock Exam Results: all your past papers with grades, scores by topic, and trend (improving or declining).',
      'Parent view: PIN-protected. Set a 4-digit PIN the first time you open it. Shows AI readiness summary, mock results, and weak areas for a parent to discuss.'
    ]
  },
  {
    id: 'armory',
    icon: '🛡️',
    title: 'Armory (Skins)',
    color: 'from-amber-500 to-yellow-500',
    badge: 'Customise',
    steps: [
      'Earn gems by completing topics and practice sessions.',
      'Spend gems to unlock avatar skins — shown on the dashboard profile card.',
      'Equip any unlocked skin from the Armory.'
    ]
  }
];

const activeFeature = ref(null);
const openFeature = (f) => { activeFeature.value = activeFeature.value?.id === f.id ? null : f; };

import { ref } from 'vue';
</script>

<template>
  <div class="pb-24 space-y-4 animate-in fade-in duration-300">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-black text-slate-800">How EduGenius Works</h2>
        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Tap any feature to learn more</p>
      </div>
      <button @click="emit('back')" class="px-4 py-2 bg-white border-2 border-slate-100 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm">← Back</button>
    </div>

    <!-- Quick summary card -->
    <div class="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-5 text-white">
      <p class="text-[9px] font-black uppercase tracking-widest opacity-70 mb-2">The Learning Flow</p>
      <div class="flex items-center gap-2 text-[10px] font-black flex-wrap">
        <span class="bg-white/20 px-2 py-1 rounded-lg">📖 Briefing</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/20 px-2 py-1 rounded-lg">⚡ Practice</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/20 px-2 py-1 rounded-lg">⭐ Mastery Test</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/20 px-2 py-1 rounded-lg">📝 Mock Exam</span>
      </div>
      <p class="text-[8px] font-bold opacity-70 mt-3">Start each topic in Briefing. Practise until 50%. Take the test. Once mastered, do a Mock Exam across multiple topics.</p>
    </div>

    <!-- Feature cards — expandable -->
    <div class="space-y-2">
      <div v-for="feature in features" :key="feature.id">
        <button @click="openFeature(feature)"
          class="w-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all active:scale-[0.99]">
          <div class="flex items-center gap-3 p-4">
            <div :class="['w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 bg-gradient-to-br', feature.color]">
              {{ feature.icon }}
            </div>
            <div class="flex-1 text-left">
              <div class="flex items-center gap-2">
                <p class="text-[11px] font-black text-slate-800">{{ feature.title }}</p>
                <span class="text-[6px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">{{ feature.badge }}</span>
              </div>
              <p class="text-[8px] text-slate-400 font-bold mt-0.5">{{ feature.steps[0].substring(0, 55) }}...</p>
            </div>
            <span class="text-slate-300 font-black text-sm transition-transform duration-200"
              :class="activeFeature?.id === feature.id ? 'rotate-180' : ''">▼</span>
          </div>
        </button>

        <!-- Expanded content -->
        <div v-if="activeFeature?.id === feature.id"
          class="bg-white rounded-2xl border border-slate-100 shadow-sm mx-1 -mt-1 pt-1 overflow-hidden animate-in slide-in-from-top-2 duration-200">
          <div class="p-4 pt-3 space-y-2">
            <div v-for="(step, i) in feature.steps" :key="i"
              class="flex gap-3 items-start bg-slate-50 rounded-xl p-3">
              <span :class="['w-5 h-5 rounded-lg flex items-center justify-center text-[8px] font-black text-white flex-shrink-0 bg-gradient-to-br', feature.color]">
                {{ i + 1 }}
              </span>
              <p class="text-[10px] font-bold text-slate-700 leading-relaxed pt-0.5">{{ step }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tips section -->
    <div class="bg-amber-50 border border-amber-100 rounded-3xl p-5 space-y-3">
      <p class="text-[10px] font-black text-amber-700 uppercase tracking-widest">Quick Tips</p>
      <div class="space-y-2">
        <div v-for="tip in [
          '📎 Upload your notes BEFORE starting practice — questions become personalised to what your teacher taught.',
          '🖨️ For Mock Exams, the Print option is great for realistic exam practice — answer on paper, then upload for marking.',
          '📊 Check Progress weekly — the Topic Heatmap shows at a glance which areas need more work.',
          '👨‍👩‍👧 Share the parent PIN with a parent — they get a clear report of your progress and exam readiness.',
          '🔁 If a topic says Struggling, go back to Briefing, re-read the Logic Flow, then try Practice again.'
        ]" :key="tip" class="flex items-start gap-2">
          <p class="text-[9px] font-bold text-amber-800 leading-relaxed">{{ tip }}</p>
        </div>
      </div>
    </div>

  </div>
</template>