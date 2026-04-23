import { createApp } from 'vue';
import App from './App.vue';
import { DUMMY_STUDENT } from './constants';

/**
 * SEEDING FOR TESTING
 * If no users exist, we inject a Demo account
 */
const seedData = () => {
  const users = JSON.parse(localStorage.getItem('edugenius_users') || '[]');
  if (users.length === 0) {
    users.push({
      name: 'DemoGenius',
      password: 'password123',
      profile: DUMMY_STUDENT
    });
    localStorage.setItem('edugenius_users', JSON.stringify(users));
    console.info("EduGenius: Seeded demo user 'DemoGenius' (pass: password123)");
  }
};

seedData();
createApp(App).mount('#app');