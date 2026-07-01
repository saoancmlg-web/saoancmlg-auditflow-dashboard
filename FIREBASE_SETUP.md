# Firebase live-saving setup

The GitHub Pages app can run in two modes:

1. Local demo mode - default. Records are saved in the current browser only.
2. Firebase live mode - shared records, report history, and audit log entries are saved in Firestore.

## 1. Create Firebase project

Go to <https://console.firebase.google.com/> and create a project.

## 2. Add a web app

In Firebase project settings, add a Web app and copy the Firebase config.

Paste it into `firebase-config.js`:

```js
window.AUDITFLOW_FIREBASE_CONFIG = {
  enabled: true,
  collections: {
    stateDocPath: "auditflow/state",
    auditLog: "auditflowAuditLog"
  },
  firebaseConfig: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  }
};
```

## 3. Enable Firestore

Create a Firestore database.

For a sample/demo-only pilot, you can use temporary test access. Do not use this with confidential audit information.

Before real department data is entered, enable Authentication and lock Firestore rules so only approved users can read or write.

## 4. What is saved

The prototype stores:

- audit matrix records;
- monthly report history;
- audit log entries for create/update/delete/report generation/reset actions.

## 5. Next production step

Replace the role selector with real Firebase Authentication or Microsoft sign-in. Then update Firestore rules to enforce:

- Internal Auditor: add/update assigned matters;
- Senior Accounts Officer: edit all matters and close/generate reports;
- Permanent Secretary: view dashboard/register/reports only.
