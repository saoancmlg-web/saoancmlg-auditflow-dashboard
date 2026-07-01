// AuditFlow Firebase configuration
// ------------------------------------------------------------
// The Firebase project is connected, but live saving remains disabled
// until Firestore security rules are selected and reviewed.
//
// To enable live shared saving safely:
// 1. Enable Firestore Database in the Firebase console.
// 2. Configure Authentication and Firestore security rules.
// 3. Change enabled to true only after rules are ready.
//
// Keep this repository public only for demo/sample data. Do not place
// confidential audit data in a public repo or in an unsecured Firebase project.

window.AUDITFLOW_FIREBASE_CONFIG = {
  enabled: false,
  collections: {
    stateDocPath: "auditflow/state",
    auditLog: "auditflowAuditLog"
  },
  firebaseConfig: {
    apiKey: "AIzaSyAegP1OoGLEAeaxLoCjfcHWJJALgpNuDiw",
    authDomain: "auditflow-department-dashboard.firebaseapp.com",
    projectId: "auditflow-department-dashboard",
    storageBucket: "auditflow-department-dashboard.firebasestorage.app",
    messagingSenderId: "670111853374",
    appId: "1:670111853374:web:d2acd301aef12503691a6f",
    measurementId: "G-5QREMENS89"
  }
};