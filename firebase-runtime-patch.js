(() => {
  "use strict";

  const STORAGE_KEY = "auditflow.records.v1";
  const REPORTS_KEY = "auditflow.reports.v1";
  const RELOAD_FLAG = "auditflow.remoteReload.v1";

  const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  const originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  let liveReady = false;
  let applyingRemote = false;
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
    const service = getService();
    if (!service) return;

    const status = await service.init({
      seedRecords: currentRecords(),
      seedReportHistory: currentReportHistory()
    });

    if (!status.ready) {
      showLiveBadge("Local demo mode", "local");
      return;
    }

    liveReady = true;
    showLiveBadge("Live data connected", "live");
    service.subscribe(applyRemoteState, (error) => {
      console.error("AuditFlow live listener failed", error);
      showLiveBadge("Live connection interrupted", "local");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectLiveData, { once: true });
  } else {
    connectLiveData();
  }
})();