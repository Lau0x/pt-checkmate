const DEFAULT_SETTINGS = {
  autoRun: true,
  periodDays: 21,
  scheduleTime: "11:00",
  closeTabs: true,
  tabActive: false
};

const siteList = document.querySelector("#siteList");
const template = document.querySelector("#siteTemplate");
const saveButton = document.querySelector("#save");
const addSiteButton = document.querySelector("#addSite");
const saveState = document.querySelector("#saveState");
const autoRun = document.querySelector("#autoRun");
const periodDays = document.querySelector("#periodDays");
const scheduleTime = document.querySelector("#scheduleTime");
const closeTabs = document.querySelector("#closeTabs");
const tabActive = document.querySelector("#tabActive");

let currentSites = [];

document.addEventListener("DOMContentLoaded", load);
siteList.addEventListener("submit", (event) => event.preventDefault());
addSiteButton.addEventListener("click", () => {
  currentSites.push(createSite());
  renderSites();
});
saveButton.addEventListener("click", () => {
  save().catch((error) => {
    setSaveState(`保存失败：${error.message || error}`, false);
  });
});

async function load() {
  const { sites, settings } = await chrome.storage.local.get(["sites", "settings"]);
  currentSites = Array.isArray(sites) ? sites : [];
  const finalSettings = { ...DEFAULT_SETTINGS, ...settings };

  autoRun.value = String(finalSettings.autoRun);
  periodDays.value = String(finalSettings.periodDays);
  scheduleTime.value = finalSettings.scheduleTime || "11:00";
  closeTabs.value = String(finalSettings.closeTabs);
  tabActive.value = String(finalSettings.tabActive);

  renderSites();
}

function renderSites() {
  siteList.innerHTML = "";

  if (!currentSites.length) {
    currentSites.push(createSite());
  }

  currentSites.forEach((site, index) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".siteCard");
    card.dataset.index = String(index);

    for (const input of node.querySelectorAll("[data-field]")) {
      const field = input.dataset.field;
      if (input.type === "checkbox") {
        input.checked = site[field] !== false;
      } else {
        input.value = site[field] || "";
      }

      input.addEventListener("input", () => {
        if (input.type === "checkbox") {
          currentSites[index][field] = input.checked;
        } else {
          currentSites[index][field] = input.value;
        }
      });
    }

    node.querySelector("[data-action='remove']").addEventListener("click", () => {
      currentSites.splice(index, 1);
      renderSites();
    });

    siteList.appendChild(node);
  });
}

async function save() {
  setSaveState("保存中", true);

  const cleanSites = currentSites
    .map((site) => ({
      id: site.id || crypto.randomUUID(),
      enabled: site.enabled !== false,
      name: String(site.name || "").trim(),
      url: String(site.url || "").trim(),
      checkInUrl: String(site.checkInUrl || "").trim(),
      waitSeconds: Number(site.waitSeconds || 3),
      keywords: String(site.keywords || "").trim(),
      selectors: String(site.selectors || "").trim()
    }))
    .filter((site) => site.url);

  if (!cleanSites.length) {
    setSaveState("请先填写至少一个首页 URL", false);
    return;
  }

  const origins = cleanSites
    .flatMap((site) => [site.url, site.checkInUrl])
    .map(originFromUrl)
    .filter(Boolean);

  if (!origins.length) {
    setSaveState("URL 需要以 http:// 或 https:// 开头", false);
    return;
  }

  if (origins.length) {
    setSaveState("等待 Chrome 授权", true);
    const granted = await requestOrigins(Array.from(new Set(origins)));

    if (!granted) {
      setSaveState("已取消授权，配置未保存", false);
      return;
    }
  }

  const settings = {
    autoRun: autoRun.value === "true",
    periodDays: clamp(Number(periodDays.value || 21), 1, 29),
    scheduleTime: scheduleTime.value || "11:00",
    closeTabs: closeTabs.value === "true",
    tabActive: tabActive.value === "true"
  };

  await storageSet({
    sites: cleanSites,
    settings
  });

  chrome.runtime.sendMessage({ type: "SYNC_ALARM" });
  currentSites = cleanSites;
  renderSites();
  setSaveState("已保存", false);
}

function createSite() {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    name: "",
    url: "",
    checkInUrl: "",
    waitSeconds: 3,
    keywords: "",
    selectors: ""
  };
}

function originFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return "";
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setSaveState(text, busy) {
  saveState.textContent = text;
  saveButton.disabled = busy;
  saveButton.textContent = busy ? "处理中" : "保存并授权";
}

function requestOrigins(origins) {
  return new Promise((resolve, reject) => {
    chrome.permissions.request({ origins }, (granted) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(Boolean(granted));
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}
