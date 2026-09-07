const DEFAULT_KEYWORDS = [
  "签到",
  "每日签到",
  "打卡",
  "签 到",
  "簽到",
  "簽 到",
  "领取奖励",
  "領取獎勵",
  "bonus",
  "claim bonus",
  "check in",
  "check-in",
  "attendance"
];

const DEFAULT_DONE_KEYWORDS = [
  "已签到",
  "已签",
  "今日已签到",
  "今天已签到",
  "今日已签",
  "已经签到",
  "已打卡",
  "已领取",
  "已領取",
  "已完成",
  "签到成功",
  "簽到成功",
  "checked in",
  "already checked",
  "already claimed",
  "completed"
];

const DEFAULT_SETTINGS = {
  autoRun: true,
  periodDays: 21,
  scheduleTime: "11:00",
  visitMode: "background",
  closeTabs: true,
  tabActive: false
};

const CHECK_ALARM = "pt-auto-check";
const ACTIVE_RUN_TTL_MS = 30 * 60 * 1000;
const TAB_LOAD_TIMEOUT_MS = 25 * 1000;
const SCRIPT_TIMEOUT_MS = 30 * 1000;

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(["sites", "settings", "runs"]);

  if (!Array.isArray(stored.sites)) {
    await chrome.storage.local.set({ sites: [] });
  }

  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }

  await clearStaleActiveRun();
  await syncAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await clearStaleActiveRun();
  const didRun = await runIfOverdue("开机补跑");
  if (!didRun) {
    await syncAlarm();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    syncAlarm();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM) {
    runAllSites("定时巡检")
      .finally(scheduleNextRunAfterCheck);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "RUN_ALL") {
    runAllSites("手动巡检")
      .then((summary) => sendResponse({ ok: true, summary }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SYNC_ALARM") {
    syncAlarm()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function syncAlarm() {
  const { settings, schedule } = await chrome.storage.local.get(["settings", "schedule"]);
  const finalSettings = { ...DEFAULT_SETTINGS, ...settings };

  await chrome.alarms.clear(CHECK_ALARM);

  if (!finalSettings.autoRun) {
    await chrome.storage.local.set({ schedule: null });
    return;
  }

  const periodDays = Math.max(1, Number(finalSettings.periodDays || 21));
  const scheduleTime = finalSettings.scheduleTime || "11:00";
  const savedTime = Date.parse(schedule?.nextRunAt || "");
  const canReuseSchedule = schedule?.periodDays === periodDays
    && schedule?.scheduleTime === scheduleTime
    && Number.isFinite(savedTime)
    && savedTime > Date.now();
  const nextRun = canReuseSchedule
    ? new Date(savedTime)
    : getNextRunAt(scheduleTime);

  await setNextAlarm(nextRun, finalSettings);
}

async function runIfOverdue(source) {
  const { settings, schedule, activeRun } = await chrome.storage.local.get(["settings", "schedule", "activeRun"]);
  const finalSettings = { ...DEFAULT_SETTINGS, ...settings };

  if (!finalSettings.autoRun || (activeRun?.status === "running" && !isActiveRunStale(activeRun))) {
    return false;
  }

  const nextRunAt = Date.parse(schedule?.nextRunAt || "");

  if (!Number.isFinite(nextRunAt)) {
    await syncAlarm();
    return false;
  }

  if (Date.now() < nextRunAt) {
    return false;
  }

  await runAllSites(source);
  await scheduleNextRunAfterCheck();
  return true;
}

async function scheduleNextRunAfterCheck() {
  const { settings } = await chrome.storage.local.get("settings");
  const finalSettings = { ...DEFAULT_SETTINGS, ...settings };

  if (!finalSettings.autoRun) {
    await chrome.alarms.clear(CHECK_ALARM);
    await chrome.storage.local.set({ schedule: null });
    return;
  }

  const nextRun = getNextRunAfter(new Date(), finalSettings);
  await setNextAlarm(nextRun, finalSettings);
}

async function setNextAlarm(nextRun, settings) {
  await chrome.alarms.clear(CHECK_ALARM);
  await chrome.alarms.create(CHECK_ALARM, {
    when: nextRun.getTime()
  });
  await chrome.storage.local.set({
    schedule: {
      nextRunAt: nextRun.toISOString(),
      periodDays: Math.max(1, Number(settings.periodDays || 21)),
      scheduleTime: settings.scheduleTime || "11:00"
    }
  });
}

async function runAllSites(source) {
  const { sites, settings } = await chrome.storage.local.get(["sites", "settings"]);
  const enabledSites = (Array.isArray(sites) ? sites : []).filter((site) => site.enabled !== false);
  const finalSettings = { ...DEFAULT_SETTINGS, ...settings };
  const startedAt = new Date().toISOString();
  const results = [];

  await chrome.storage.local.set({
    activeRun: {
      source,
      startedAt,
      status: "running",
      total: enabledSites.length,
      completed: 0
    }
  });

  try {
    for (const site of enabledSites) {
      const result = await runSite(site, finalSettings);
      results.push(result);

      await chrome.storage.local.set({
        activeRun: {
          source,
          startedAt,
          status: "running",
          total: enabledSites.length,
          completed: results.length,
          latest: result
        }
      });
    }
  } catch (error) {
    results.push({
      name: "巡检任务",
      checkedAt: new Date().toISOString(),
      status: "失败",
      detail: error.message || String(error),
      clicked: false
    });
  }

  const finishedAt = new Date().toISOString();
  const run = {
    id: crypto.randomUUID(),
    source,
    startedAt,
    finishedAt,
    results
  };

  const stored = await chrome.storage.local.get("runs");
  const runs = Array.isArray(stored.runs) ? stored.runs : [];
  runs.unshift(run);

  await chrome.storage.local.set({
    activeRun: null,
    runs: runs.slice(0, 20)
  });

  return run;
}

async function runSite(site, settings) {
  const targetUrl = normalizeUrl(site.checkInUrl || site.url);

  if (!targetUrl) {
    return buildResult(site, {
      status: "配置错误",
      detail: "URL 为空或格式不正确"
    });
  }

  const permission = await hasOriginPermission(targetUrl);
  if (!permission) {
    return buildResult(site, {
      status: "缺少权限",
      detail: "请在扩展配置页为这个站点授权"
    });
  }

  if (settings.visitMode === "request") {
    return requestSite(site, targetUrl);
  }

  let tab;

  try {
    tab = await withTimeout(
      chrome.tabs.create({
        active: settings.visitMode === "foreground" || Boolean(settings.tabActive),
        url: targetUrl
      }),
      TAB_LOAD_TIMEOUT_MS,
      "打开标签页超时"
    );

    await withTimeout(waitForTabComplete(tab.id), TAB_LOAD_TIMEOUT_MS, "页面加载超时");

    const [injection] = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: inspectAndCheckIn,
        args: [
          {
            name: site.name,
            keywords: splitList(site.keywords).concat(DEFAULT_KEYWORDS),
            doneKeywords: DEFAULT_DONE_KEYWORDS,
            selectors: splitList(site.selectors),
            waitSeconds: Number(site.waitSeconds || 3)
          }
        ]
      }),
      SCRIPT_TIMEOUT_MS,
      "页面巡检脚本超时"
    );

    const value = injection?.result || {};

    if (value.clicked) {
      await sleep(2500);
    }

    return buildResult(site, {
      url: value.url || targetUrl,
      title: value.title || "",
      status: value.status || "已访问",
      detail: value.detail || "",
      clicked: Boolean(value.clicked),
      clickedText: value.clickedText || ""
    });
  } catch (error) {
    return buildResult(site, {
      url: targetUrl,
      status: "失败",
      detail: error.message
    });
  } finally {
    if (settings.closeTabs && tab?.id) {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

async function requestSite(site, targetUrl) {
  let timeout;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(targetUrl, {
      credentials: "include",
      redirect: "follow",
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") || "";
    const text = contentType.includes("text/html") ? await response.clone().text() : "";
    const lowerText = text.toLowerCase();
    const needsLogin = lowerText.includes("type=\"password\"")
      || lowerText.includes("type='password'")
      || /\/login|login\.php|signin|sign-in/.test(response.url.toLowerCase());

    return buildResult(site, {
      url: response.url || targetUrl,
      status: needsLogin ? "可能需要手动登录" : "已请求访问",
      detail: `HTTP ${response.status}${response.redirected ? "，发生跳转" : ""}。仅请求模式不会执行网页 JS 或点击签到按钮。`,
      clicked: false
    });
  } catch (error) {
    return buildResult(site, {
      url: targetUrl,
      status: "失败",
      detail: `仅请求失败：${error.message}`
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildResult(site, extra) {
  return {
    siteId: site.id,
    name: site.name || site.url || "未命名站点",
    checkedAt: new Date().toISOString(),
    ...extra
  };
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

async function hasOriginPermission(urlValue) {
  const url = new URL(urlValue);
  const origin = `${url.protocol}//${url.host}/*`;
  return chrome.permissions.contains({ origins: [origin] });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        setTimeout(finish, 1500);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(finish, 20000);
  });
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getNextRunAt(timeValue) {
  const match = String(timeValue || "11:00").match(/^(\d{1,2}):(\d{2})$/);
  const hour = match ? clamp(Number(match[1]), 0, 23) : 11;
  const minute = match ? clamp(Number(match[2]), 0, 59) : 0;
  const nextRun = new Date();

  nextRun.setHours(hour, minute, 0, 0);

  if (nextRun.getTime() <= Date.now()) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun;
}

function getNextRunAfter(baseDate, settings) {
  const nextRun = new Date(baseDate);
  const match = String(settings.scheduleTime || "11:00").match(/^(\d{1,2}):(\d{2})$/);
  const hour = match ? clamp(Number(match[1]), 0, 23) : 11;
  const minute = match ? clamp(Number(match[2]), 0, 59) : 0;
  const days = Math.max(1, Number(settings.periodDays || 21));

  nextRun.setDate(nextRun.getDate() + days);
  nextRun.setHours(hour, minute, 0, 0);

  return nextRun;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function clearStaleActiveRun() {
  const { activeRun } = await chrome.storage.local.get("activeRun");
  if (isActiveRunStale(activeRun)) {
    await chrome.storage.local.set({ activeRun: null });
  }
}

function isActiveRunStale(activeRun) {
  if (activeRun?.status !== "running") return false;

  const startedAt = Date.parse(activeRun.startedAt || "");
  return !Number.isFinite(startedAt) || Date.now() - startedAt > ACTIVE_RUN_TTL_MS;
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => clearTimeout(timeout));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function inspectAndCheckIn(config) {
  await waitForPageReady();
  await sleep(Math.max(0, config.waitSeconds || 0) * 1000);

  const passwordField = document.querySelector("input[type='password']");
  if (isVisible(passwordField)) {
    return {
      url: location.href,
      title: document.title,
      status: "需要手动登录",
      detail: "页面出现密码输入框，扩展不会保存或填写密码",
      clicked: false
    };
  }

  const doneStatus = findDoneStatus(config.doneKeywords || []);
  if (doneStatus) {
    return {
      url: location.href,
      title: document.title,
      status: "已签到",
      detail: `页面显示：${doneStatus}`,
      clicked: false
    };
  }

  const bySelector = findBySelectors(config.selectors || []);
  if (bySelector) {
    const clickedText = getElementText(bySelector);
    bySelector.click();

    return {
      url: location.href,
      title: document.title,
      status: "已点击签到",
      detail: "通过 CSS 选择器匹配",
      clicked: true,
      clickedText
    };
  }

  const byKeyword = findByKeywords(config.keywords || []);
  if (byKeyword) {
    const clickedText = getElementText(byKeyword);
    byKeyword.click();

    return {
      url: location.href,
      title: document.title,
      status: "已点击签到",
      detail: "通过关键词匹配",
      clicked: true,
      clickedText
    };
  }

  return {
    url: location.href,
    title: document.title,
    status: "已访问",
    detail: "没有找到可点击的签到按钮；如果该站只要求定期登录，这已经满足访问",
    clicked: false
  };

  function findBySelectors(selectors) {
    for (const selector of selectors) {
      try {
        const elements = Array.from(document.querySelectorAll(selector));
        const target = elements.find((element) => isClickable(element) && isVisible(element));
        if (target) return target;
      } catch {
      }
    }
    return null;
  }

  function findDoneStatus(doneKeywords) {
    const normalizedDoneKeywords = doneKeywords
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean);

    const candidates = Array.from(
      document.querySelectorAll([
        "button",
        "a",
        "input[type='button']",
        "input[type='submit']",
        "[role='button']",
        ".button",
        ".btn",
        ".alert",
        ".notice",
        ".message",
        ".modal",
        ".dialog"
      ].join(","))
    );

    for (const element of candidates) {
      if (!isVisible(element)) continue;
      const text = getElementText(element).toLowerCase();
      const matched = normalizedDoneKeywords.find((keyword) => text.includes(keyword));
      if (matched) return getElementText(element) || matched;
    }

    const bodyText = String(document.body?.innerText || "").toLowerCase();
    const matched = normalizedDoneKeywords.find((keyword) => bodyText.includes(keyword));
    return matched || "";
  }

  function findByKeywords(keywords) {
    const normalizedKeywords = keywords
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean);

    const candidates = Array.from(
      document.querySelectorAll([
        "button",
        "a",
        "input[type='button']",
        "input[type='submit']",
        "[role='button']",
        ".button",
        ".btn"
      ].join(","))
    );

    return candidates.find((element) => {
      if (!isClickable(element) || !isVisible(element)) return false;

      const text = getElementText(element).toLowerCase();
      if (!text) return false;

      return normalizedKeywords.some((keyword) => text.includes(keyword));
    }) || null;
  }

  function getElementText(element) {
    if (!element) return "";
    return String(element.innerText || element.value || element.textContent || element.getAttribute("aria-label") || "").trim();
  }

  function isClickable(element) {
    if (!element) return false;
    if (element.disabled || element.getAttribute("aria-disabled") === "true") return false;
    return true;
  }

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  }

  function waitForPageReady() {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      window.addEventListener("DOMContentLoaded", resolve, { once: true });
      setTimeout(resolve, 10000);
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
