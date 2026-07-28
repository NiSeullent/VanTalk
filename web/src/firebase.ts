import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

/** Firebase Auth only — VanTalk data/files use Supabase (not Firestore/Storage). */
const firebaseConfig = {
  apiKey: 'AIzaSyB30qOEiQKKPSnJpiobrd3ySdvPo2I9h0g',
  authDomain: 'vantalk-5594d.firebaseapp.com',
  projectId: 'vantalk-5594d',
  storageBucket: 'vantalk-5594d.firebasestorage.app',
  messagingSenderId: '510201010657',
  appId: '1:510201010657:web:b21a6c62f7e7d36e545aa0',
  measurementId: 'G-V6N4EE4XWM',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
