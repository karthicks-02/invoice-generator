const firebaseConfig = {
  apiKey: "AIzaSyAxOpAjSvzX091t9YmNPEdVPWMUHOZ6P38",
  authDomain: "karthick-industries.firebaseapp.com",
  projectId: "karthick-industries",
  storageBucket: "karthick-industries.firebasestorage.app",
  messagingSenderId: "417217609009",
  appId: "1:417217609009:web:1145cccc60ab32ead08410",
  measurementId: "G-C3RV8072NW"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();
