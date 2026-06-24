<script setup>
import { computed } from 'vue';

const props = defineProps(['student', 'level', 'activeSubject', 'currentView']);
const emit = defineEmits(['selectSubject', 'goHome', 'logout', 'changeView']);

// Bottom nav holds ONLY the journey spine, in order:
// Learn(Home) → Assess(Diagnostic) → Skill Map → Plan → Prove(Mock) → Track(Progress).
// Engagement (Armory/shop) is a header layer, not a stage. Study tools
// (flashcards, cheat sheet, notes, Socrates) live inside the topic workspace.
const navItems = [
  { id: 'dashboard',  label: 'Home',      icon: '🏠' },
  { id: 'diagnostic', label: 'Diagnostic', icon: '📋' },
  { id: 'skillmap',   label: 'Skill Map',  icon: '🗺️' },
  { id: 'plan',       label: 'Plan',       icon: '🎯' },
  { id: 'mockexam',   label: 'Mock',       icon: '📝' },
  { id: 'stats',      label: 'Progress',   icon: '📈' },
];

// Hide the header/nav inside LearningArena (it has its own UI)
const hideChrome = computed(() => props.currentView === 'learning');
</script>

<template>
  <!--
    Layout structure:
    ┌─────────────────────┐
    │ Header (sticky)     │  ← fixed height, safe-area aware
    ├─────────────────────┤
    │ Main (scrollable)   │  ← flex-1, overflow-y-auto — THIS is where scroll lives
    │  <slot />           │
    │                     │
    │ [bottom padding]    │  ← pb-28 so content clears the bottom nav
    ├─────────────────────┤
    │ Bottom Nav (fixed)  │  ← absolute to container, not to viewport
    └─────────────────────┘
  -->
  <div class="h-full flex flex-col bg-slate-50 text-slate-900">

    <!-- Header -->
    <header
      v-if="!hideChrome"
      class="flex-shrink-0 bg-white border-b border-slate-100 px-4 flex justify-between items-center z-50 shadow-sm"
      style="padding-top: max(0.75rem, env(safe-area-inset-top)); padding-bottom: 0.75rem;"
    >
      <div class="flex items-center gap-2 cursor-pointer" @click="emit('goHome')">
        <div class="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm shadow">E</div>
        <h1 class="text-sm font-black tracking-tighter text-slate-800">EduGenius</h1>
      </div>

      <div class="flex items-center gap-2">
        <!-- Engagement layer: streak + gems, tap gems to open the Armory -->
        <div v-if="student?.streak" class="flex items-center gap-1 text-[10px] font-black text-orange-500" title="Daily streak">
          🔥 {{ student.streak }}
        </div>
        <button
          @click="emit('changeView', 'shop')"
          class="flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-1 rounded-full text-[10px] font-black hover:bg-amber-100 transition-colors"
          title="Armory — spend your gems"
        >
          💎 {{ student?.gems ?? 0 }}
        </button>
        <div class="bg-slate-100 p-0.5 rounded-full flex">
          <button
            v-for="s in ['Maths', 'Science']"
            :key="s"
            @click="emit('selectSubject', s)"
            :class="[
              'px-2.5 py-1 rounded-full text-[8px] font-black transition-all uppercase tracking-widest',
              activeSubject === s ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            ]"
          >
            {{ s }}
          </button>
        </div>
        <button
          @click="emit('logout')"
          class="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs transition-all hover:bg-slate-200 active:scale-90"
          title="Log out"
        >
          👋
        </button>
      </div>
    </header>

    <!-- 
      MAIN SCROLL AREA — this is the only element that scrolls.
      overflow-y-auto + flex-1 is the correct pattern.
      pb-28 ensures content is never hidden behind the bottom nav.
    -->
    <main
      class="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4"
      :class="hideChrome ? 'pb-0' : 'pb-28'"
      style="
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      "
    >
      <slot />
    </main>

    <!-- Bottom Nav -->
    <nav
      v-if="!hideChrome"
      class="flex-shrink-0 bg-white/95 backdrop-blur-lg border-t border-slate-100 px-6 flex justify-around items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]"
      style="padding-top: 0.625rem; padding-bottom: max(1.25rem, env(safe-area-inset-bottom));"
    >
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="emit('changeView', item.id)"
        :class="[
          'flex flex-col items-center justify-center gap-1 transition-all group min-w-[48px]',
          currentView === item.id ? 'text-indigo-600' : 'text-slate-400'
        ]"
      >
        <div class="relative">
          <span
            class="text-xl block transition-transform group-active:scale-125"
            :class="{ 'scale-110 -translate-y-0.5': currentView === item.id }"
          >
            {{ item.icon }}
          </span>
          <!-- Active indicator dot -->
          <div
            v-if="currentView === item.id"
            class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-600 rounded-full"
          ></div>
        </div>
        <span
          class="text-[7px] font-black uppercase tracking-widest transition-colors"
          :class="currentView === item.id ? 'text-indigo-600' : 'text-slate-400'"
        >
          {{ item.label }}
        </span>
      </button>
    </nav>

  </div>
</template>