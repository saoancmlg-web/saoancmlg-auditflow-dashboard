// AuditFlow Firebase configuration
// ------------------------------------------------------------
// Live shared saving is enabled. Access is controlled in Firebase
// Authentication and Firestore security rules, not by this public config file.
//
// Current first authorised Google account in Firestore rules:
// - sao.anc.mlg@gmail.com
//
// Add the Internal Auditor, Senior Accounts Officer, Permanent Secretary,
// and any other approved officers in Firestore rules before asking them to use
// live shared data.

window.AUDITFLOW_FIREBASE_CONFIG = {
  enabled: true,
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