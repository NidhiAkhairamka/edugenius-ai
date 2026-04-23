
<script setup>
import { ref, computed } from 'vue';

const emit = defineEmits(['login']);

// View States: 'signin', 'signup', 'forgot', 'sent', 'reset'
const authMode = ref('signin');

const name = ref('');
const password = ref('');
const email = ref('');
const dob = ref('');
const year = ref(7);
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const isProcessing = ref(false);

const handleSignIn = () => {
  console.log("EduGenius: Sign-in attempt for", name.value);
  error.value = '';
  if (!name.value || !password.value) {
    error.value = 'Identity credentials required.';
    return;
  }

  const users = JSON.parse(localStorage.getItem('edugenius_users') || '[]');
  const user = users.find(u => u.name.toLowerCase() === name.value.toLowerCase() && u.password === password.value);
  
  if (user) {
    emit('login', user.profile);
  } else {
    error.value = 'Invalid nickname or secret key.';
  }
};

const handleSignUp = () => {
  console.log("EduGenius: Sign-up attempt for", name.value);
  error.value = '';
  if (!name.value || !password.value || !email.value || !dob.value) {
    error.value = 'All fields are mandatory for mission enrollment.';
    return;
  }

  const users = JSON.parse(localStorage.getItem('edugenius_users') || '[]');

  // Uniqueness check: Nickname + Email + DOB
  const exists = users.some(u => 
    u.profile.name.toLowerCase() === name.value.toLowerCase() || 
    (u.profile.email.toLowerCase() === email.value.toLowerCase() && u.profile.dob === dob.value)
  );

  if (exists) {
    error.value = 'A student with these details is already enrolled.';
    return;
  }

  const newProfile = {
    name: name.value,
    email: email.value,
    dob: dob.value,
    yearLevel: year.value,
    totalPoints: 0,
    experience: 0,
    gems: 100,
    streak: 1,
    rank: 'Novice Apprentice',
    activeSkinId: 'skin-og',
    unlockedSkins: ['skin-og'],
    lastActive: new Date().toDateString(),
    badges: [
      { id: 'b1', name: 'Explorer', icon: '🧭', description: 'Join the academy.', unlocked: true },
    ],
    dailyMissions: [
      { id: 'm1', text: 'Answer 5 questions correctly', completed: false, reward: 200 },
    ],
    masteryData: {}
  };

  users.push({ name: name.value, password: password.value, profile: newProfile });
  localStorage.setItem('edugenius_users', JSON.stringify(users));
  emit('login', newProfile);
};

const handleRecoverIdentity = () => {
  error.value = '';
  if (!name.value || !email.value || !dob.value) {
    error.value = 'Please provide Nickname, Email, and DOB to verify identity.';
    return;
  }

  const users = JSON.parse(localStorage.getItem('edugenius_users') || '[]');
  const user = users.find(u => 
    u.profile.name.toLowerCase() === name.value.toLowerCase() && 
    u.profile.email.toLowerCase() === email.value.toLowerCase() && 
    u.profile.dob === dob.value
  );

  if (!user) {
    error.value = 'Identity not found in the Academy records.';
    return;
  }

  isProcessing.value = true;
  // Simulate mail sending delay
  setTimeout(() => {
    isProcessing.value = false;
    authMode.value = 'sent';
  }, 1500);
};

const handleResetPassword = () => {
  error.value = '';
  if (!newPassword.value || newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords must match.';
    return;
  }

  const users = JSON.parse(localStorage.getItem('edugenius_users') || '[]');
  const userIdx = users.findIndex(u => u.profile.name.toLowerCase() === name.value.toLowerCase());

  if (userIdx !== -1) {
    users[userIdx].password = newPassword.value;
    localStorage.setItem('edugenius_users', JSON.stringify(users));
    authMode.value = 'signin';
    password.value = '';
    alert("Secret key updated! Please log in with your new credentials.");
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-indigo-50 p-6 overflow-y-auto bg-[radial-gradient(#e0e7ff_1px,transparent_1px)] [background-size:20px_20px]">
    <div class="max-w-md w-full bg-white rounded-[3rem] shadow-2xl p-8 space-y-6 animate-in zoom-in duration-500 my-8 border-t-[12px] border-indigo-600 relative overflow-hidden">
      
      <!-- Background Accents -->
      <div class="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50 rounded-full blur-3xl"></div>

      <!-- Header -->
      <div class="text-center relative z-10">
        <div class="w-16 h-16 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-3xl mx-auto shadow-xl mb-4 animate-bounce">🎓</div>
        <h1 class="text-2xl font-black text-slate-800 tracking-tight italic">EduGenius AI</h1>
        <p class="text-slate-400 font-bold mt-1 uppercase tracking-widest text-[8px]">GCSE Pathway Mastery Platform</p>
      </div>

      <!-- Mode Selector -->
      <div v-if="['signin', 'signup'].includes(authMode)" class="flex bg-slate-100 p-1.5 rounded-2xl mb-4 shadow-inner relative z-10">
        <button 
          @click="authMode = 'signin'"
          :class="['flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest', authMode === 'signin' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500']"
        >
          Sign In
        </button>
        <button 
          @click="authMode = 'signup'"
          :class="['flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest', authMode === 'signup' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500']"
        >
          Create Profile
        </button>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="bg-rose-50 text-rose-600 p-3 rounded-xl text-[10px] font-black text-center border border-rose-100 animate-in slide-in-from-top-2 relative z-10">
        ⚠️ {{ error }}
      </div>

      <!-- SIGN IN FORM -->
      <div v-if="authMode === 'signin'" class="space-y-4 animate-in fade-in">
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nickname</label>
          <input v-model="name" type="text" placeholder="e.g. CaptainGenius" class="auth-input" />
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Secret Key</label>
          <input v-model="password" type="password" placeholder="••••••••" class="auth-input" />
        </div>
        <div class="flex justify-end">
          <button @click="authMode = 'forgot'" class="text-[9px] font-black text-indigo-500 hover:underline uppercase tracking-widest">Forgot Secret Key?</button>
        </div>
        <button @click="handleSignIn" class="auth-btn">Enter Academy 🚀</button>
      </div>

      <!-- SIGN UP FORM -->
      <div v-else-if="authMode === 'signup'" class="space-y-4 animate-in fade-in">
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nickname (Unique ID)</label>
          <input v-model="name" type="text" placeholder="Choose a unique ID" class="auth-input" />
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
          <input v-model="email" type="email" placeholder="student@genius.com" class="auth-input" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">DOB</label>
            <input v-model="dob" type="date" class="auth-input" />
          </div>
          <div class="space-y-1">
            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Secret Key</label>
            <input v-model="password" type="password" placeholder="••••••••" class="auth-input" />
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Year Group</label>
          <div class="grid grid-cols-6 gap-1">
            <button v-for="y in [5,6,7,8,9,10]" :key="y" @click="year = y" :class="['py-2 rounded-lg border-2 text-[9px] font-black transition-all', year === y ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-50 text-slate-400']">Y{{y}}</button>
          </div>
        </div>
        <button @click="handleSignUp" class="auth-btn">Start Journey ✨</button>
      </div>

      <!-- FORGOT PASSWORD FORM -->
      <div v-else-if="authMode === 'forgot'" class="space-y-4 animate-in slide-in-from-right-4">
        <div class="text-center p-2">
          <h3 class="font-black text-slate-800 text-sm">Identity Recovery</h3>
          <p class="text-[10px] text-slate-400 font-bold mt-1 leading-tight">Verify your account details to reset your secret key.</p>
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nickname</label>
          <input v-model="name" type="text" placeholder="Your Nickname" class="auth-input" />
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Registered Email</label>
          <input v-model="email" type="email" placeholder="Your Email" class="auth-input" />
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date of Birth</label>
          <input v-model="dob" type="date" class="auth-input" />
        </div>
        <button @click="handleRecoverIdentity" :disabled="isProcessing" class="auth-btn">
          {{ isProcessing ? 'Verifying Neural Link...' : 'Send Recovery Link ✉️' }}
        </button>
        <button @click="authMode = 'signin'" class="w-full text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600">Back to Login</button>
      </div>

      <!-- LINK SENT FORM -->
      <div v-else-if="authMode === 'sent'" class="space-y-6 animate-in zoom-in text-center py-6">
        <div class="text-6xl mb-4">📧</div>
        <h3 class="font-black text-slate-800 text-xl">Recovery Link Dispatched</h3>
        <p class="text-xs font-bold text-slate-500 px-4 leading-relaxed">
          We've sent a secure recovery link to <span class="text-indigo-600 font-black">{{ email }}</span>. 
          Please check your inbox (and spam folder) to proceed.
        </p>
        <div class="pt-4 space-y-3">
          <button @click="authMode = 'reset'" class="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg">Mock: Click Link to Reset</button>
          <button @click="authMode = 'signin'" class="w-full text-[9px] font-black text-slate-400 uppercase tracking-widest">Return to Academy Entrance</button>
        </div>
      </div>

      <!-- RESET PASSWORD FORM -->
      <div v-else-if="authMode === 'reset'" class="space-y-4 animate-in slide-in-from-bottom-4">
        <div class="text-center p-2">
          <h3 class="font-black text-slate-800 text-sm">Create New Secret Key</h3>
          <p class="text-[10px] text-slate-400 font-bold mt-1 leading-tight">Identity verified for <span class="text-indigo-600">{{ name }}</span>.</p>
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">New Secret Key</label>
          <input v-model="newPassword" type="password" placeholder="••••••••" class="auth-input" />
        </div>
        <div class="space-y-1">
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirm New Secret Key</label>
          <input v-model="confirmPassword" type="password" placeholder="••••••••" class="auth-input" />
        </div>
        <button @click="handleResetPassword" class="auth-btn">Update & Login 🚀</button>
      </div>

      <!-- Footer Info -->
      <div class="pt-4 border-t border-slate-50 relative z-10 text-center">
        <p class="text-[7px] text-slate-300 font-bold uppercase tracking-[0.4em]">
          End-to-End Encryption • Relational Progress Labs
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  border: 2px solid #f1f5f9;
  background-color: #f8fafc;
  outline: none;
  transition: all 0.2s;
  font-weight: 700;
  font-size: 0.875rem;
}
.auth-input:focus {
  border-color: #4f46e5;
  background-color: white;
}
.auth-btn {
  width: 100%;
  padding: 1rem;
  background-color: #4f46e5;
  color: white;
  border-radius: 1.5rem;
  font-weight: 900;
  font-size: 1.125rem;
  box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.2);
  transition: all 0.2s;
  border-bottom: 4px solid #312e81;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}
.auth-btn:hover {
  background-color: #4338ca;
}
.auth-btn:active {
  transform: translateY(2px);
  border-bottom-width: 2px;
}
.auth-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
