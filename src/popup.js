const runNow = document.querySelector("#runNow");
const openOptions = document.querySelector("#openOptions");
const siteCount = document.querySelector("#siteCount");
const runState = document.querySelector("#runState");
const results = document.querySelector("#results");
const ACTIVE_RUN_TTL_MS = 30 * 60 * 1000;

document.addEventListener("DOMContentLoaded", render);
runNow.addEventListener("click", runAll);
openOptions.addEventListener("click", openSettings);
chrome.storage.onChanged.addListener(render);

async function render() {
  const { sites, runs, activeRun } = await chrome.storage.local.get(["sites", "runs", "activeRun"]);
  const enabledCount = (Array.isArray(sites) ? sites : []).filter((site) => site.enabled !== false).length;
  siteCount.textContent = enabledCount ? `${enabledCount} 个站点已启用` : "还没有配置站点";

  if (activeRun?.status === "running" && !isActiveRunStale(activeRun)) {
    runState.textContent = `运行中：${activeRun.completed}/${activeRun.total}`;
    runNow.disabled = true;
  } else if (isActiveRunStale(activeRun)) {
    runState.textContent = "上次巡检中断，可重新巡检";
    runNow.disabled = false;
  } else {
    runState.textContent = "未运行";
    runNow.disabled = false;
  }

  const latest = Array.isArray(runs) ? runs[0] : null;
  results.innerHTML = "";

  if (!latest) {
    results.innerHTML = `<p class="empty">暂无巡检记录</p>`;
    return;
  }

  for (const result of latest.results || []) {
    const item = document.createElement("div");
    item.className = "resultItem";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(result.name)}</strong>
        <span>${formatTime(result.checkedAt)}</span>
      </div>
      <p>${escapeHtml(result.status || "")}</p>
      ${result.detail ? `<small>${escapeHtml(result.detail)}</small>` : ""}
    `;
    results.appendChild(item);
  }
}

async function runAll() {
  const { sites } = await chrome.storage.local.get("sites");
  const enabledSites = (Array.isArray(sites) ? sites : []).filter((site) => site.enabled !== false);

  if (!enabledSites.length) {
    openSettings();
    return;
  }

  const granted = await requestOrigins(enabledSites);
  if (!granted) {
    runState.textContent = "没有授权站点权限";
    return;
  }

  runNow.disabled = true;
  runState.textContent = "启动中";
  chrome.runtime.sendMessage({ type: "RUN_ALL" }, (response) => {
    if (!response?.ok) {
      runState.textContent = response?.error || "运行失败";
      runNow.disabled = false;
    }
  });
}

function requestOrigins(sites) {
  const origins = sites
    .flatMap((site) => [site.url, site.checkInUrl])
    .map(originFromUrl)
    .filter(Boolean);

  if (!origins.length) return Promise.resolve(false);

  return chrome.permissions.request({
    origins: Array.from(new Set(origins))
  });
}

function originFromUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return "";
  }
}

function openSettings() {
  chrome.tabs.create({
    active: true,
    url: chrome.runtime.getURL("options.html")
  });
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function isActiveRunStale(activeRun) {
  if (activeRun?.status !== "running") return false;

  const startedAt = Date.parse(activeRun.startedAt || "");
  return !Number.isFinite(startedAt) || Date.now() - startedAt > ACTIVE_RUN_TTL_MS;
}
