<script setup>
import { ref, reactive, onMounted, watch, computed } from 'vue';
import Auth from './components/Auth.vue';
import Dashboard from './components/Dashboard.vue';
import LearningArena from './components/LearningArena.vue';
import Layout from './components/Layout.vue';
import AdaptiveDiagnostic from './components/Adaptivediagnostic.vue';
import SkillMap from './components/SkillMap.vue';
import Statistics from './components/Statistics.vue';
import AgentShop from './components/AgentShop.vue';
import AcademyGuide from './components/AcademyGuide.vue';
import PaperScanner from './components/PaperScanner.vue';
import MockExam from './components/MockExam.vue';
import { INITIAL_STUDENT, RANKS } from './constants';
import { db } from './services/dbService';

const view = ref('login');
const isLoadingDB = ref(true);

const student = reactive({
  ...INITIAL_STUDENT,
  currentAgentEyeVault: [],
  currentBriefingVault: [],
});

onMounted(async () => {
  try {
    await db.init();
    const currentSessionName = localStorage.getItem('edugenius_active_session_name');
    if (currentSessionName) {
      const profile = await db.getProfile(currentSessionName);
      if (profile) {
        Object.assign(student, profile);
        view.value = 'dashboard';
      }
    }
  } catch (err) {
    console.error('Session Restore Error:', err);
  } finally {
    isLoadingDB.value = false;
  }
});

const currentLevel = computed(() => Math.floor(student.experience / 1000) + 1);
const currentSubject = ref('Maths');
const currentTopic = ref(null);

const handleLogin = async (profile) => {
  Object.assign(student, profile);
  localStorage.setItem('edugenius_active_session_name', profile.name);
  view.value = 'dashboard';
  try {
    await db.saveProfile(student);
  } catch (err) {
    console.warn('EduGenius: Profile Sync failed, using local mode.', err);
  }
};

const handleLogout = () => {
  localStorage.removeItem('edugenius_active_session_name');
  Object.assign(student, INITIAL_STUDENT);
  view.value = 'login';
};

const navigateTo = (newView) => { view.value = newView; };

const handleStartTopic = async (topic) => {
  currentTopic.value = topic;
  student.currentBriefingVault = await db.getBriefingVault(student.name, topic.id);
  student.currentAgentEyeVault = await db.getAgentEyeVault(student.name, topic.id);
  view.value = 'learning';
};

const handleComplete = () => {
  view.value = 'dashboard';
};

const handleDiagnosticComplete = (data) => {
  view.value = 'skillmap';
};

const handleUpdateProgress = (topicId, score, difficulty) => {
  if (!student.masteryData) student.masteryData = {};
  const existing = student.masteryData[topicId] || {};
  student.masteryData[topicId] = {
    ...existing,
    score: Math.max(existing.score || 0, score),
    difficulty,
    status: score >= 100 ? 'completed' : score > 0 ? 'in-progress' : existing.status || 'not-started',
    attempts: (existing.attempts || 0) + 1,
    lastAttempt: new Date().toISOString()
  };
  db.saveProfile(student).catch(() => {});
};
</script>

<template>
  <!-- 
    ROOT: full-screen, no overflow hidden at this level.
    The scroll happens INSIDE Layout's <main> element, not here.
  -->
  <div class="fixed inset-0 bg-slate-50 flex items-center justify-center font-sans">

    <!-- Loading Overlay -->
    <Transition name="fade">
      <div v-if="isLoadingDB" class="absolute inset-0 z-[300] bg-slate-950 flex flex-col items-center justify-center">
        <div class="w-10 h-10 border-4 border-t-indigo-500 border-white/10 rounded-full animate-spin mb-4"></div>
        <p class="font-black text-slate-400 uppercase tracking-[0.3em] text-[9px]">Syncing Academy...</p>
      </div>
    </Transition>

    <!-- Main App Shell -->
    <div class="w-full h-full max-w-md mx-auto relative bg-white shadow-2xl overflow-hidden flex flex-col">

      <Auth v-if="view === 'login'" @login="handleLogin" />

      <Layout
        v-else
        :student="student"
        :level="currentLevel"
        :activeSubject="currentSubject"
        :currentView="view"
        @selectSubject="s => { currentSubject = s; view = 'dashboard'; }"
        @goHome="view = 'dashboard'"
        @logout="handleLogout"
        @changeView="navigateTo"
      >
        <Transition name="slide-fade" mode="out-in">
          <Dashboard
            v-if="view === 'dashboard'"
            :student="student"
            :level="currentLevel"
            :activeSubject="currentSubject"
            @startTopic="handleStartTopic"
            @openGuide="view = 'guide'"
            @startMock="view = 'mockexam'"
          />
          <LearningArena
            v-else-if="view === 'learning'"
            :topic="currentTopic"
            :student="student"
            @complete="handleComplete"
            @exit="view = 'dashboard'"
            @updateProgress="handleUpdateProgress"
          />
          <Statistics v-else-if="view === 'stats'" :student="student" @back="view = 'dashboard'" />
          <AgentShop
            v-else-if="view === 'shop'"
            :student="student"
            @purchase="id => student.unlockedSkins.push(id)"
            @equip="id => student.activeSkinId = id"
            @back="view = 'dashboard'"
          />
          <AcademyGuide v-else-if="view === 'guide'" @back="view = 'dashboard'" />
          <MockExam v-else-if="view === 'mockexam'" :student="student" @back="view = 'dashboard'" />
          <PaperScanner v-else-if="view === 'scanning'" @analysisComplete="() => view = 'dashboard'" @cancel="view = 'dashboard'" />

          <AdaptiveDiagnostic
  v-else-if="view === 'diagnostic'"
  :student="student"
  @exit="view = 'dashboard'"
  @complete="(data) => { view = 'skillmap'; }"
/>
<SkillMap
  v-else-if="view === 'skillmap'"
  :student="student"
  @back="view = 'dashboard'"
  @takeDiagnostic="view = 'diagnostic'"
  @planGenerated="view = 'dashboard'"
/>

        </Transition>
      </Layout>

    </div>
  </div>
</template>

<style>
/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  /* 
    CRITICAL FIX: overflow:hidden on html/body was preventing ALL scrolling.
    Remove it here — scroll is managed per-component inside Layout's <main>.
  */
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
}

/* ── Transitions ── */
.slide-fade-enter-active { transition: all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); }
.slide-fade-leave-active { transition: all 0.25s ease-in; }
.slide-fade-enter-from { transform: translateY(12px); opacity: 0; }
.slide-fade-leave-to { transform: translateY(-8px); opacity: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── Scrollbar styling — thin and subtle ── */
* {
  scrollbar-width: thin;
  scrollbar-color: #e2e8f0 transparent;
}
*::-webkit-scrollbar { width: 3px; height: 3px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }

/* ── No scrollbar utility ── */
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
</style>