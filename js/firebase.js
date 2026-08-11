import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getFirestore, doc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyB9cOdbAyvlJyX2xXvxKET-pyt3OxhGjqk',
  authDomain: 'kz-roadmap.firebaseapp.com',
  projectId: 'kz-roadmap',
  storageBucket: 'kz-roadmap.firebasestorage.app',
  messagingSenderId: '54403974618',
  appId: '1:54403974618:web:01a324928f9ba12a3f6ce3',
};

const app = initializeApp(firebaseConfig);
const dbFs = getFirestore(app);
export const stateDocRef = doc(dbFs, 'kz-roadmap', 'state');
export { setDoc, onSnapshot };
