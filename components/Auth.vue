<script setup>
import { ref } from 'vue';
import { db } from '../services/dbService';

const emit = defineEmits(['login']);

// role tab: 'parent' | 'child';  parentMode: 'signin' | 'signup'
const role = ref('parent');
const parentMode = ref('signin');

const email = ref('');
const password = ref('');
const displayName = ref('');
const username = ref('');
const error = ref('');
const busy = ref(false);

function fail(msg) { error.value = msg; busy.value = false; }

async function parentSignIn() {
  error.value = '';
  if (!email.value || !password.value) return fail('Email and password required.');
  busy.value = true;
  const res = await db.parentLogin(email.value, password.value);
  busy.value = false;
  if (res.ok) emit('login', res.profile);
  else fail(res.error === 'invalid_credentials' ? 'Wrong email or password.' : 'Login failed. Try again.');
}

async function parentSignUp() {
  error.value = '';
  if (!email.value || !password.value) return fail('Email and password required.');
  busy.value = true;
  const res = await db.parentSignup(email.value, password.value, displayName.value);
  busy.value = false;
  if (res.ok) emit('login', res.profile);
  else fail(res.error === 'account_exists' ? 'An account with this email already exists.' : 'Sign-up failed.');
}

async function childSignIn() {
  error.value = '';
  if (!username.value || !password.value) return fail('Username and password required.');
  busy.value = true;
  const res = await db.childLogin(username.value, password.value);
  busy.value = false;
  if (res.ok) emit('login', res.profile);
  else fail(res.error === 'invalid_credentials' ? 'Wrong username or password.' : 'Login failed.');
}

async function adminSignIn() {
  error.value = '';
  if (!email.value || !password.value) return fail('Email and password required.');
  busy.value = true;
  const res = await db.adminLogin(email.value, password.value);
  busy.value = false;
  if (res.ok) emit('login', res.profile);
  else fail(res.error === 'invalid_credentials' ? 'Wrong admin credentials.' : 'Login failed.');
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-indigo-50 p-6 overflow-y-auto bg-[radial-gradient(#e0e7ff_1px,transparent_1px)] [background-size:20px_20px]">
    <div class="max-w-md w-full bg-white rounded-[3rem] shadow-2xl p-8 space-y-6 my-8 border-t-[12px] border-indigo-600 relative overflow-hidden">

      <div class="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50 rounded-full blur-3xl"></div>

      <!-- Header -->
      <div class="text-center relative z-10">
        <div class="w-16 h-16 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-3xl mx-auto shadow-xl mb-4">🎓</div>
        <h1 class="text-2xl font-black text-slate-800 tracking-tight italic">EduGenius AI</h1>
        <p class="text-slate-400 font-bold mt-1 uppercase tracking-widest text-[8px]">Universal Maths Mastery</p>
      </div>

      <!-- Role selector -->
      <div v-if="role !== 'admin'" class="flex bg-slate-100 p-1.5 rounded-2xl mb-2 shadow-inner relative z-10">
        <button @click="role = 'parent'; error = ''"
          :class="['flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest', role === 'parent' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500']">
          👨‍👩‍👧 Parent
        </button>
        <button @click="role = 'child'; error = ''"
          :class="['flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest', role === 'child' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500']">
          🧒 Student
        </button>
      </div>

      <!-- Error -->
      <div v-if="error" class="bg-rose-50 text-rose-600 p-3 rounded-xl text-[10px] font-black text-center border border-rose-100 relative z-10">
        ⚠️ {{ error }}
      </div>

      <!-- PARENT -->
      <div v-if="role === 'parent'" class="space-y-4 relative z-10">
        <div class="flex bg-slate-50 p-1 rounded-xl">
          <button @click="parentMode = 'signin'; error = ''" :class="['flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest', parentMode === 'signin' ? 'bg-white text-indigo-600 shadow' : 'text-slate-400']">Sign In</button>
          <button @click="parentMode = 'signup'; error = ''" :class="['flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest', parentMode === 'signup' ? 'bg-white text-indigo-600 shadow' : 'text-slate-400']">Create Account</button>
        </div>

        <div v-if="parentMode === 'signup'" class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Your name</label>
          <input v-model="displayName" type="text" placeholder="e.g. Nidhi" class="auth-input" />
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
          <input v-model="email" type="email" placeholder="you@email.com" class="auth-input" @keydown.enter="parentMode === 'signin' ? parentSignIn() : parentSignUp()" />
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
          <input v-model="password" type="password" placeholder="••••••••" class="auth-input" @keydown.enter="parentMode === 'signin' ? parentSignIn() : parentSignUp()" />
        </div>
        <button v-if="parentMode === 'signin'" @click="parentSignIn" :disabled="busy" class="auth-btn">{{ busy ? 'Signing in…' : 'Sign In 🚀' }}</button>
        <button v-else @click="parentSignUp" :disabled="busy" class="auth-btn">{{ busy ? 'Creating…' : 'Create Account ✨' }}</button>
        <p class="text-[9px] text-slate-400 font-bold text-center leading-relaxed">Parents manage their children's profiles, reports and study plans here.</p>
      </div>

      <!-- CHILD -->
      <div v-else class="space-y-4 relative z-10">
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Username</label>
          <input v-model="username" type="text" placeholder="e.g. mishka2025" class="auth-input" @keydown.enter="childSignIn" />
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
          <input v-model="password" type="password" placeholder="••••••••" class="auth-input" @keydown.enter="childSignIn" />
        </div>
        <button @click="childSignIn" :disabled="busy" class="auth-btn">{{ busy ? 'Signing in…' : 'Start Learning 🚀' }}</button>
        <p class="text-[9px] text-slate-400 font-bold text-center leading-relaxed">No account yet? Ask your parent to set one up for you.</p>
      </div>

      <!-- ADMIN -->
      <div v-if="role === 'admin'" class="space-y-4 relative z-10">
        <div class="text-center">
          <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">🔐 Admin — Question Review</span>
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin email</label>
          <input v-model="email" type="email" placeholder="admin@edugenius.ai" class="auth-input" @keydown.enter="adminSignIn" />
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
          <input v-model="password" type="password" placeholder="••••••••" class="auth-input" @keydown.enter="adminSignIn" />
        </div>
        <button @click="adminSignIn" :disabled="busy" class="auth-btn">{{ busy ? 'Signing in…' : 'Enter Review 🔐' }}</button>
      </div>

      <div class="pt-4 border-t border-slate-50 relative z-10 text-center">
        <button v-if="role !== 'admin'" @click="role = 'admin'; error = ''" class="text-[8px] text-slate-300 hover:text-slate-500 font-bold uppercase tracking-[0.3em]">Admin access</button>
        <button v-else @click="role = 'parent'; error = ''" class="text-[8px] text-slate-300 hover:text-slate-500 font-bold uppercase tracking-[0.3em]">← Back to login</button>
        <p class="text-[7px] text-slate-300 font-bold uppercase tracking-[0.4em] mt-2">Evidence-based • Skill-graph driven</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-input {
  width: 100%; padding: 0.75rem 1rem; border-radius: 0.75rem;
  border: 2px solid #f1f5f9; background-color: #f8fafc; outline: none;
  transition: all 0.2s; font-weight: 700; font-size: 0.875rem;
}
.auth-input:focus { border-color: #4f46e5; background-color: white; }
.auth-btn {
  width: 100%; padding: 1rem; background-color: #4f46e5; color: white;
  border-radius: 1.5rem; font-weight: 900; font-size: 1.125rem;
  box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.2);
  transition: all 0.2s; border-bottom: 4px solid #312e81;
  display: flex; align-items: center; justify-content: center; gap: 0.75rem;
}
.auth-btn:hover { background-color: #4338ca; }
.auth-btn:active { transform: translateY(2px); border-bottom-width: 2px; }
.auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
