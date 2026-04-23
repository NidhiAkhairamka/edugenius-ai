
<script setup>
import { computed } from 'vue';
import { AGENT_SKINS } from '../constants';

const props = defineProps(['student']);
const emit = defineEmits(['back', 'purchase', 'equip']);

const sortedSkins = computed(() => {
  return (AGENT_SKINS || []).map(skin => ({
    ...skin,
    unlocked: props.student.unlockedSkins?.includes(skin.id) || false,
    isEquipped: props.student.activeSkinId === skin.id
  }));
});

const handleAction = (skin) => {
  if (skin.unlocked) {
    if (!skin.isEquipped) emit('equip', skin.id);
  } else {
    if (props.student.gems >= skin.cost) {
      emit('purchase', skin.id);
    } else {
      alert("You need more Gems! Keep studying to earn them. 💎");
    }
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-8 animate-in zoom-in duration-300">
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-4">
        <button @click="emit('back')" class="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center font-black hover:bg-slate-50 transition-all">←</button>
        <h2 class="text-3xl font-black text-slate-800">Agent Armory</h2>
      </div>
      <div class="bg-indigo-600 text-white px-6 py-3 rounded-2xl flex items-center gap-3 shadow-xl">
        <span class="text-xl">💎</span>
        <span class="text-xl font-black">{{ student.gems }} Gems</span>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div 
        v-for="skin in sortedSkins" 
        :key="skin.id"
        :class="['bg-white p-8 rounded-[3rem] border-4 transition-all flex flex-col items-center text-center space-y-4 shadow-sm', 
          skin.isEquipped ? 'border-indigo-600 bg-indigo-50/20' : 'border-slate-50']"
      >
        <div class="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center text-6xl shadow-inner mb-2 group">
          <span class="group-hover:rotate-12 transition-transform duration-300">{{ skin.icon }}</span>
        </div>
        
        <div>
          <h3 class="text-xl font-black text-slate-800">{{ skin.name }}</h3>
          <p class="text-xs font-bold text-slate-400 mt-1 leading-relaxed">{{ skin.description }}</p>
        </div>

        <button 
          @click="handleAction(skin)"
          :class="['w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2', 
            skin.isEquipped ? 'bg-indigo-600 text-white cursor-default' : 
            (skin.unlocked ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-900 text-white hover:bg-indigo-600')]"
        >
          <template v-if="skin.isEquipped">EQUIPPED ✅</template>
          <template v-else-if="skin.unlocked">EQUIP NOW</template>
          <template v-else>
            UNLOCK FOR <span class="text-lg">💎</span> {{ skin.cost }}
          </template>
        </button>
      </div>
    </div>

    <div class="bg-indigo-50 p-8 rounded-[3rem] text-center border-2 border-dashed border-indigo-200">
      <p class="text-xs font-black text-indigo-400 uppercase tracking-widest">More Agent Personalities coming soon...</p>
    </div>
  </div>
</template>
