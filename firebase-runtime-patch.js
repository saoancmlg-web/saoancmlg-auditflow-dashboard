(() => {
  "use strict";

  const STORAGE_KEY = "auditflow.records.v1";
  const REPORTS_KEY = "auditflow.reports.v1";
  const RELOAD_FLAG = "auditflow.remoteReload.v1";

  const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  const originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  let liveReady = false;
  let applyingRemote = false;
  let connecting = false;
  let saveTimer = 0;

  const getService = () => window.AuditFlowBackend;

  function sampleRecords() {
    return Array.isArray(window.AUDITFLOW_SAMPLE_DATA)
      ? window.AUDITFLOW_SAMPLE_DATA.map((record) => ({ ...record }))
      : [];
  }

  function parseStorage(key, fallback) {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch (error) {
      console.warn(`AuditFlow could not read ${key}`, error);
      return fallback;
    }
  }

  function currentRecords() {
    return parseStorage(STORAGE_KEY, sampleRecords());
  }

  function currentReportHistory() {
    return parseStorage(REPORTS_KEY, []);
  }

  function currentRole() {
    return document.querySelector('[data-change="role"]')?.value || "Browser user";
  }

  function showLiveBadge(message, mode = "local") {
    const existing = document.querySelector("[data-live-sync-badge]");
    const badge = existing || document.createElement("div");
    badge.dataset.liveSyncBadge = "true";
    badge.textContent = message;
    badge.style.position = "fixed";
    badge.style.left = "18px";
    badge.style.bottom = "18px";
    badge.style.zIndex = "10000";
    badge.style.padding = "9px 12px";
    badge.style.borderRadius = "999px";
    badge.style.font = "600 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    badge.style.letterSpacing = "0.01em";
    badge.style.boxShadow = "0 12px 30px rgba(6, 40, 74, 0.18)";
    badge.style.color = mode === "live" ? "#075f60" : "#7a4a00";
    badge.style.background = mode === "live" ? "#dff8f4" : "#fff4d6";
    badge.style.border = mode === "live" ? "1px solid #a7ebe1" : "1px solid #f8daa2";

    if (!existing) {
      document.body.appendChild(badge);
    }
  }

  function removeSignInPanel() {
    document.querySelector("[data-live-signin-panel]")?.remove();
  }

  function showSignInPanel(message) {
    const existing = document.querySelector("[data-live-signin-panel]");
    const panel = existing || document.createElement("section");
    panel.dataset.liveSigninPanel = "true";
    panel.setAttribute("role", "status");
    panel.style.position = "fixed";
    panel.style.left = "18px";
    panel.style.bottom = "64px";
    panel.style.zIndex = "10001";
    panel.style.maxWidth = "320px";
    panel.style.padding = "14px";
    panel.style.borderRadius = "18px";
    panel.style.background = "#ffffff";
    panel.style.border = "1px solid rgba(7, 95, 96, 0.18)";
    panel.style.boxShadow = "0 18px 50px rgba(6, 40, 74, 0.22)";
    panel.style.font = "500 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    panel.style.color = "#17324d";

    panel.innerHTML = `
      <div style="font-weight: 750; font-size: 14px; margin-bottom: 4px;">Connect live saving</div>
      <div style="margin-bottom: 10px; color: #516070;">${message}</div>
      <button type="button" data-live-signin-button style="border: 0; border-radius: 999px; background: #0f766e; color: white; cursor: pointer; font-weight: 750; padding: 9px 13px;">Sign in with Google</button>
    `;

    const button = panel.querySelector("[data-live-signin-button]");
    button.addEventListener("click", async () => {
      const service = getService();
      if (!service || !service.signIn) return;

      button.disabled = true;
      button.textContent = "Opening Google sign-in...";
      showLiveBadge("Google sign-in required", "local");

      try {
        await service.signIn();
        button.textContent = "Connecting live data...";
        await connectLiveData();
      } catch (error) {
        console.error("AuditFlow sign-in failed", error);
        button.disabled = false;
        button.textContent = "Try Google sign-in again";
        showLiveBadge("Google sign-in needed", "local");
      }
    });

    if (!existing) {
      document.body.appendChild(panel);
    }
  }

  function scheduleRemoteSave(action) {
    if (!liveReady || applyingRemote || !getService()) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      getService()
        .saveAll(currentRecords(), currentReportHistory(), {
          action,
          role: currentRole(),
          summary: "Saved from the shared web dashboard"
        })
        .catch((error) => {
          console.error("AuditFlow live save failed", error);
          showLiveBadge("Live save needs attention", "local");
        });
    }, 350);
  }

  window.localStorage.setItem = function patchedSetItem(key, value) {
    originalSetItem(key, value);
    if (key === STORAGE_KEY || key === REPORTS_KEY) {
      scheduleRemoteSave(key === STORAGE_KEY ? "Register updated" : "Report history updated");
    }
  };

  window.localStorage.removeItem = function patchedRemoveItem(key) {
    originalRemoveItem(key);
    if (key === STORAGE_KEY || key === REPORTS_KEY) {
      scheduleRemoteSave("Sample data restored");
    }
  };

  function applyRemoteState(payload) {
    if (!payload || !liveReady) return;

    const nextRecords = JSON.stringify(payload.records || []);
    const nextReports = JSON.stringify(payload.reportHistory || []);
    const currentRecordText = window.localStorage.getItem(STORAGE_KEY) || "";
    const currentReportText = window.localStorage.getItem(REPORTS_KEY) || "";

    if (nextRecords === currentRecordText && nextReports === currentReportText) return;

    applyingRemote = true;
    originalSetItem(STORAGE_KEY, nextRecords);
    originalSetItem(REPORTS_KEY, nextReports);
    originalSetItem(RELOAD_FLAG, String(Date.now()));
    applyingRemote = false;

    showLiveBadge("Live update received - refreshing", "live");
    window.setTimeout(() => window.location.reload(), 600);
  }

  async function connectLiveData() {
    if (connecting) return;
    const service = getService();
    if (!service) return;

    connecting = true;

    try {
      const status = await service.init({
        seedRecords: currentRecords(),
        seedReportHistory: currentReportHistory()
      });

      if (!status.ready) {
        liveReady = false;
        const message = status.message || "Live saving is not connected.";
        showLiveBadge(status.mode === "signin" ? "Sign in for live saving" : "Local demo mode", "local");

        if (status.mode === "signin") {
          showSignInPanel(message);
        }
        return;
      }

      liveReady = true;
      removeSignInPanel();
      showLiveBadge("Live data connected", "live");
      service.subscribe(applyRemoteState, (error) => {
        console.error("AuditFlow live listener failed", error);
        showLiveBadge("Live connection interrupted", "local");
      });
    } catch (error) {
      console.error("AuditFlow live connection failed", error);
      showLiveBadge("Local demo mode", "local");
    } finally {
      connecting = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectLiveData, { once: true });
  } else {
    connectLiveData();
  }
})();