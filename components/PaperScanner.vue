
<script setup>
import { ref } from 'vue';
import { VisionAgent } from '../services/geminiService';

const emit = defineEmits(['analysisComplete', 'cancel']);
const isScanning = ref(false);
const previewUrl = ref(null);
const fileData = ref({ base64: null, mimeType: null });
const fileInput = ref(null);

const handleFileChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target.result.split(',')[1];
      fileData.value = { 
        base64: base64String, 
        mimeType: file.type || 'image/jpeg' 
      };
      previewUrl.value = e.target.result;
    };
    reader.readAsDataURL(file);
  }
};

const triggerFileSelect = () => {
  fileInput.value.click();
};

const analyze = async () => {
  if (!fileData.value.base64) return;
  isScanning.value = true;
  try {
    const data = await VisionAgent.analyzePaper(fileData.value.base64, fileData.value.mimeType);
    emit('analysisComplete', data, previewUrl.value);
  } catch (err) {
    console.error("Scan Error:", err);
    if (err.message === 'KEY_SYNC_REQUIRED') {
       alert("Mission Blocked: Please link your paid project to use Agent Eye analysis.");
    } else {
       alert("The Agent Eye failed to process this document. Ensure it's a clear image or PDF under 5MB!");
    }
  } finally {
    isScanning.value = false;
  }
};
</script>

<template>
  <div class="max-w-2xl mx-auto bg-white rounded-[3rem] shadow-2xl p-10 text-center animate-in zoom-in duration-300">
    <div v-if="!previewUrl" class="space-y-8">
      <div class="space-y-2">
        <h2 class="text-3xl font-black text-slate-800 tracking-tight">Agent Eye: Style Capture</h2>
        <p class="text-slate-500 font-bold">Show me a worksheet or PDF to copy its style!</p>
      </div>
      
      <div 
        @click="triggerFileSelect"
        class="border-8 border-dashed border-slate-100 rounded-[3rem] p-20 cursor-pointer hover:border-indigo-400 transition-all group relative overflow-hidden bg-slate-50/50"
      >
        <div class="relative z-10">
          <span class="text-7xl block group-hover:scale-110 transition-transform duration-500">📄</span>
          <p class="mt-4 font-black text-slate-400">Click to Upload Image or PDF</p>
          <p class="text-[10px] font-black uppercase tracking-widest text-slate-300 mt-2">JPG, PNG, or PDF supported</p>
        </div>
        <input ref="fileInput" type="file" accept="image/*,.pdf" class="hidden" @change="handleFileChange" />
      </div>
      
      <button @click="emit('cancel')" class="text-slate-400 font-black uppercase tracking-widest text-xs hover:text-slate-800 transition-colors">Abort Mission</button>
    </div>

    <div v-else class="space-y-8">
      <div class="relative rounded-[2.5rem] overflow-hidden border-8 border-slate-50 aspect-[3/4] bg-slate-100 shadow-inner group">
        <!-- PDF Preview Fallback -->
        <div v-if="fileData.mimeType === 'application/pdf'" class="w-full h-full flex flex-col items-center justify-center bg-slate-200">
           <span class="text-8xl">📑</span>
           <p class="font-black text-slate-500 mt-4">PDF Document Ready</p>
        </div>
        <img v-else :src="previewUrl" class="w-full h-full object-cover" />
        
        <div v-if="isScanning" class="absolute inset-0 bg-indigo-600/70 backdrop-blur-md flex flex-col items-center justify-center text-white p-6 animate-in fade-in">
          <div class="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
          <p class="font-black text-2xl animate-pulse">Analyzing Structure...</p>
          <p class="text-sm font-bold opacity-80 mt-2">Identifying formulas and style</p>
        </div>
      </div>

      <div class="flex gap-4">
        <button 
          @click="previewUrl = null" 
          :disabled="isScanning"
          class="flex-1 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black text-lg disabled:opacity-50 hover:bg-slate-200 transition-all border-b-4 border-slate-200"
        >
          Retake
        </button>
        <button 
          @click="analyze" 
          :disabled="isScanning"
          class="flex-[2] py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 disabled:opacity-50 hover:bg-indigo-700 transition-all border-b-4 border-indigo-900"
        >
          {{ isScanning ? 'Processing...' : 'Sync Style 🚀' }}
        </button>
      </div>
    </div>
  </div>
</template>
