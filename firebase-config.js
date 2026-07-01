// AuditFlow Firebase configuration
// ------------------------------------------------------------
// The app works in local demo mode until this file is completed.
// To enable live shared saving:
// 1. Create a Firebase project.
// 2. Add a Web app in Firebase.
// 3. Paste the Firebase web app config below.
// 4. Change enabled to true.
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
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  }
};