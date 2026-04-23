<script setup>
import { ref, computed } from 'vue';
import { CURRICULUM, AGENT_SKINS } from '../constants';

const props = defineProps(['student', 'level', 'activeSubject']);
const emit = defineEmits(['startTopic', 'openGuide', 'startMock']);

// ── Custom Topic Modal ────────────────────────────────────────────────────────
const showCustomModal = ref(false);
const customName = ref('');
const customDescription = ref('');
const customSubject = ref(props.activeSubject || 'Maths');

// Custom topics stored locally per student
const customTopicsKey = computed(() => `edugenius_custom_topics_${props.student.name}`);
const customTopics = ref(JSON.parse(localStorage.getItem(customTopicsKey.value) || '[]'));

const saveCustomTopic = () => {
  if (!customName.value.trim()) return;
  const topic = {
    id: `custom-${Date.now()}`,
    name: customName.value.trim(),
    description: customDescription.value.trim() || `Custom topic added by ${props.student.name}.`,
    subject: customSubject.value,
    year: props.student.yearLevel,
    isCustom: true
  };
  customTopics.value.push(topic);
  localStorage.setItem(customTopicsKey.value, JSON.stringify(customTopics.value));
  customName.value = '';
  customDescription.value = '';
  showCustomModal.value = false;
};

const removeCustomTopic = (id) => {
  customTopics.value = customTopics.value.filter(t => t.id !== id);
  localStorage.setItem(customTopicsKey.value, JSON.stringify(customTopics.value));
};

// ── Topic Lists ───────────────────────────────────────────────────────────────
const builtInTopics = computed(() =>
  CURRICULUM.filter(t => t.subject === props.activeSubject && t.year === props.student.yearLevel)
);

const customFiltered = computed(() =>
  customTopics.value.filter(t => t.subject === props.activeSubject)
);

const allTopics = computed(() => [...builtInTopics.value, ...customFiltered.value]);

const activeSkin = computed(() =>
  AGENT_SKINS.find(s => s.id === props.student.activeSkinId) || AGENT_SKINS[0]
);

const masteredCount = computed(() =>
  Object.values(props.student.masteryData || {}).filter(m => m.status === 'completed').length
);

const gcseReadinessPct = computed(() => {
  if (!builtInTopics.value.length) return 0;
  const completed = builtInTopics.value.filter(t => props.student.masteryData?.[t.id]?.status === 'completed').length;
  return Math.round((completed / builtInTopics.value.length) * 100);
});

const getTopicStatus = (topic) => {
  const m = props.student.masteryData?.[topic.id];
  if (!m) return 'untouched';
  if (m.status === 'completed') return 'mastered';
  if ((m.score || 0) > 0) return 'in-progress';
  return 'untouched';
};
</script>

<template>
  <div class="space-y-4 pb-10">

    <!-- Profile Card -->
    <div class="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2rem] p-5 text-white shadow-xl relative overflow-hidden">
      <div class="relative z-10 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-2xl shadow-lg border border-white/30">
            {{ activeSkin.icon }}
          </div>
          <div>
            <h2 class="text-base font-black leading-none">{{ student.name }}</h2>
            <p class="text-[8px] font-black uppercase tracking-widest opacity-70 mt-1">Level {{ level }} · Year {{ student.yearLevel }}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-lg font-black tracking-tight">💎 {{ student.gems }}</p>
          <p class="text-[8px] opacity-60 font-bold">{{ student.totalPoints }} XP</p>
        </div>
      </div>

      <div class="mt-4 space-y-1.5 relative z-10">
        <div class="flex justify-between text-[7px] font-black uppercase tracking-widest opacity-70">
          <span>GCSE Readiness</span>
          <span>{{ gcseReadinessPct }}% — {{ masteredCount }} topics mastered</span>
        </div>
        <div class="h-2 bg-white/10 rounded-full overflow-hidden shadow-inner">
          <div
            class="h-full bg-white rounded-full transition-all duration-1000"
            :style="{ width: gcseReadinessPct + '%' }"
          ></div>
        </div>
      </div>

      <!-- Decorative blobs -->
      <div class="absolute -top-10 -right-10 w-28 h-28 bg-white/10 rounded-full blur-2xl"></div>
      <div class="absolute -bottom-6 -left-6 w-20 h-20 bg-violet-500/20 rounded-full blur-xl"></div>
    </div>

    <!-- Quick Action Row -->
    <div class="grid grid-cols-2 gap-3">
      <div
        @click="emit('startMock')"
        class="bg-slate-900 p-4 rounded-[1.5rem] cursor-pointer active:scale-95 transition-all flex flex-col gap-2"
      >
        <div class="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center text-lg shadow">📝</div>
        <div>
          <h4 class="text-[11px] font-black text-white leading-none">Mock Exam</h4>
          <p class="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Generate a timed paper</p>
        </div>
      </div>

      <div
        @click="emit('openGuide')"
        class="bg-amber-400 p-4 rounded-[1.5rem] cursor-pointer active:scale-95 transition-all flex flex-col gap-2"
      >
        <div class="w-9 h-9 bg-amber-600 rounded-xl flex items-center justify-center text-lg shadow">💡</div>
        <div>
          <h4 class="text-[11px] font-black text-amber-900 leading-none">Orientation</h4>
          <p class="text-[7px] font-bold text-amber-800/60 uppercase tracking-widest mt-0.5">+100 Gems</p>
        </div>
      </div>
    </div>

    <!-- Curriculum Topics -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          {{ activeSubject === 'Maths' ? '🔢' : '🧪' }} Year {{ student.yearLevel }} Topics
          <div class="h-[1px] w-8 bg-slate-200"></div>
        </h3>
        <button
          @click="showCustomModal = true; customSubject = activeSubject"
          class="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
        >
          <span>+</span> Add Custom
        </button>
      </div>

      <!-- Built-in Topics -->
      <div class="grid grid-cols-1 gap-2.5">
        <div
          v-for="topic in builtInTopics"
          :key="topic.id"
          @click="emit('startTopic', topic)"
          class="group bg-white p-4 rounded-[1.5rem] border-2 border-slate-50 hover:border-indigo-100 cursor-pointer transition-all active:scale-95 flex items-center gap-3 shadow-sm"
        >
          <div :class="['w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0', activeSubject === 'Maths' ? 'bg-indigo-50' : 'bg-emerald-50']">
            {{ activeSubject === 'Maths' ? '🔢' : '🧪' }}
          </div>
          <div class="flex-1 overflow-hidden">
            <h4 class="text-xs font-black text-slate-800 leading-none truncate">{{ topic.name }}</h4>
            <p class="text-[8px] text-slate-400 font-medium mt-0.5 truncate">{{ topic.description }}</p>
            <div class="mt-2">
              <div v-if="getTopicStatus(topic) === 'mastered'" class="flex items-center gap-1">
                <span class="text-[7px] font-black text-emerald-600 uppercase tracking-widest">Mastered</span>
                <span class="text-[9px]">🌟</span>
              </div>
              <div v-else class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="activeSubject === 'Maths' ? 'bg-indigo-400' : 'bg-emerald-400'"
                  :style="{ width: (student.masteryData?.[topic.id]?.score || 0) + '%' }"
                ></div>
              </div>
            </div>
          </div>
          <div class="text-slate-300 text-sm group-hover:text-indigo-400 transition-colors">›</div>
        </div>
      </div>

      <!-- Custom Topics -->
      <div v-if="customFiltered.length" class="space-y-2.5 mt-2">
        <h3 class="text-[9px] font-black text-violet-500 uppercase tracking-widest flex items-center gap-2">
          ✨ Custom Topics
          <div class="h-[1px] flex-1 bg-violet-100"></div>
        </h3>
        <div
          v-for="topic in customFiltered"
          :key="topic.id"
          class="group bg-violet-50 border-2 border-violet-100 p-4 rounded-[1.5rem] cursor-pointer active:scale-95 transition-all flex items-center gap-3"
        >
          <div class="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center text-lg shrink-0 flex-shrink-0">✨</div>
          <div class="flex-1 overflow-hidden" @click="emit('startTopic', topic)">
            <div class="flex items-center gap-1.5">
              <h4 class="text-xs font-black text-slate-800 leading-none truncate">{{ topic.name }}</h4>
              <span class="text-[6px] font-black uppercase bg-violet-200 text-violet-700 px-1.5 py-0.5 rounded-full flex-shrink-0">Custom</span>
            </div>
            <p class="text-[8px] text-slate-400 font-medium mt-0.5 truncate">{{ topic.description }}</p>
          </div>
          <button
            @click.stop="removeCustomTopic(topic.id)"
            class="w-6 h-6 bg-rose-100 rounded-lg flex items-center justify-center text-rose-400 text-xs hover:bg-rose-200 transition-all flex-shrink-0"
          >✕</button>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!allTopics.length" class="py-10 text-center bg-slate-50 rounded-3xl">
        <p class="text-3xl mb-2">📭</p>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">No topics for Year {{ student.yearLevel }} {{ activeSubject }}</p>
        <p class="text-[9px] text-slate-300 font-bold mt-1">Use "+ Add Custom" to add your school's topics</p>
      </div>
    </div>

    <!-- ── Custom Topic Modal ────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showCustomModal" class="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end justify-center p-4">
        <div class="bg-white rounded-[2rem] w-full max-w-sm p-6 space-y-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
          
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-base font-black text-slate-800">Add Custom Topic</h3>
              <p class="text-[9px] text-slate-400 font-bold mt-0.5">For topics your school teaches outside the standard curriculum</p>
            </div>
            <button @click="showCustomModal = false" class="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-all">✕</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Topic Name *</label>
              <input
                v-model="customName"
                type="text"
                placeholder="e.g. Surds & Irrational Numbers"
                class="w-full py-3 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:outline-none focus:border-indigo-400 transition-colors"
              />
            </div>

            <div>
              <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Brief Description (optional)</label>
              <textarea
                v-model="customDescription"
                placeholder="What does this topic cover? e.g. Simplifying surds, rationalising the denominator..."
                rows="2"
                class="w-full py-3 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium text-slate-700 text-sm focus:outline-none focus:border-indigo-400 transition-colors resize-none"
              ></textarea>
            </div>

            <div>
              <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Subject</label>
              <div class="flex gap-2">
                <button
                  v-for="s in ['Maths', 'Science']"
                  :key="s"
                  @click="customSubject = s"
                  :class="['flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all border-2', customSubject === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200']"
                >
                  {{ s === 'Maths' ? '🔢' : '🧪' }} {{ s }}
                </button>
              </div>
            </div>
          </div>

          <div class="flex gap-3 pt-1">
            <button
              @click="showCustomModal = false"
              class="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              @click="saveCustomTopic"
              :disabled="!customName.trim()"
              class="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-40"
            >
              Add Topic ✨
            </button>
          </div>

          <p class="text-[8px] text-slate-400 font-bold text-center">
            The AI will use your topic name to generate relevant questions at Year {{ student.yearLevel }} level.
          </p>
        </div>
      </div>
    </Teleport>

  </div>
</template>