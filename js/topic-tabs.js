export function initTopicTabs() {
  const tabNav = document.getElementById("tab-nav");
  const content = document.getElementById("content");
  if (!tabNav || !content) return;

  const tabButtons = Array.from(tabNav.querySelectorAll(".tab-btn"));
  const mobileTabsQuery = window.matchMedia("(max-width: 640px)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const topicPanels = Array.from(content.querySelectorAll(".topic-tab"));
  const topicStates = new Map();
  let railSyncFrameId = null;
  let isAnimatingTabSwap = false;
  let queuedTabId = null;

  initTopicRails();

  function revealActiveTab(tabId) {
    const activeButton = Array.from(tabButtons).find((btn) => btn.dataset.tab === tabId);
    if (!activeButton) return;

    activeButton.scrollIntoView({
      block: "nearest",
      inline: mobileTabsQuery.matches ? "center" : "nearest",
      behavior: mobileTabsQuery.matches ? "smooth" : "auto",
    });
  }

  function getTabIndex(tabId) {
    return tabButtons.findIndex((btn) => btn.dataset.tab === tabId);
  }

  function getActiveTabId() {
    return tabButtons.find((btn) => btn.classList.contains("active"))?.dataset.tab ?? null;
  }

  function syncTabState(tabId) {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
    });
    content.querySelectorAll(".tab-panel").forEach((panel) => {
      const isActive = panel.id === tabId;
      panel.classList.toggle("active", isActive);
      panel.toggleAttribute("hidden", !isActive);
    });

    const activePanel = content.querySelector(`#${tabId}`);
    content.scrollTop = 0;
    if (activePanel) {
      activePanel.scrollTop = 0;
    }
    if (mobileTabsQuery.matches) {
      window.scrollTo(0, 0);
    }
    revealActiveTab(tabId);
    scheduleTopicRailSync();
  }

  async function activate(tabId) {
    const activeTabId = getActiveTabId();
    if (!tabId || tabId === activeTabId) return;

    if (isAnimatingTabSwap) {
      queuedTabId = tabId;
      return;
    }

    const currentIndex = getTabIndex(activeTabId);
    const nextIndex = getTabIndex(tabId);
    const direction = nextIndex > currentIndex ? "forward" : "backward";
    const canAnimate =
      !reducedMotionQuery.matches &&
      typeof document.startViewTransition === "function" &&
      currentIndex !== -1 &&
      nextIndex !== -1;

    isAnimatingTabSwap = true;

    try {
      if (!canAnimate) {
        syncTabState(tabId);
        return;
      }

      document.documentElement.dataset.tabDirection = direction;
      const transition = document.startViewTransition(() => {
        syncTabState(tabId);
      });
      await transition.finished;
    } finally {
      delete document.documentElement.dataset.tabDirection;
      isAnimatingTabSwap = false;

      if (queuedTabId && queuedTabId !== getActiveTabId()) {
        const nextQueuedTabId = queuedTabId;
        queuedTabId = null;
        void activate(nextQueuedTabId);
      } else {
        queuedTabId = null;
      }
    }
  }

  syncTabState(getActiveTabId() ?? tabButtons[0]?.dataset.tab);

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      if (target) {
        void activate(target);
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      shouldIgnoreTabHotkeys(event.target)
    ) {
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const activePanel = content.querySelector(".tab-panel.active");
      const scrollTarget = getKeyboardScrollTarget(activePanel, content);
      if (!scrollTarget) return;
      focusKeyboardScrollTarget(scrollTarget);
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    const activeIndex = tabButtons.findIndex((btn) => btn.classList.contains("active"));
    if (activeIndex === -1) return;

    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (activeIndex + direction + tabButtons.length) % tabButtons.length;
    const nextTab = tabButtons[nextIndex]?.dataset.tab;
    if (!nextTab) return;

    event.preventDefault();
    void activate(nextTab);
  });

  // "Try it in the Crypto-solver" buttons inside topic tabs.
  document.querySelectorAll(".try-it-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cipher = btn.dataset.cipher;
      const cipherSelect = document.querySelector(".cipher-select");
      if (cipherSelect && cipher) {
        cipherSelect.value = cipher;
        cipherSelect.dispatchEvent(new Event("input"));
      }
      void activate("crypto-solver");
    });
  });

  topicPanels.forEach((panel) => {
    panel.addEventListener("scroll", scheduleTopicRailSync, { passive: true });
  });
  window.addEventListener("resize", scheduleTopicRailSync);
  scheduleTopicRailSync();

  function scheduleTopicRailSync() {
    if (railSyncFrameId !== null) return;
    railSyncFrameId = window.requestAnimationFrame(() => {
      railSyncFrameId = null;
      syncTopicRail();
    });
  }

  function initTopicRails() {
    topicPanels.forEach((panel) => {
      const column = panel.querySelector(".topic-column");
      const sections = Array.from(panel.querySelectorAll(".topic-section"));
      if (!column || !sections.length || panel.querySelector(".topic-rail")) return;

      const rail = document.createElement("aside");
      rail.className = "topic-rail";
      rail.setAttribute("aria-label", "Section progress");

      const railEyebrow = document.createElement("span");
      railEyebrow.className = "topic-rail-eyebrow";
      railEyebrow.textContent = "Reading guide";

      const railTrack = document.createElement("div");
      railTrack.className = "topic-rail-track";
      railTrack.setAttribute("aria-hidden", "true");

      const railProgress = document.createElement("div");
      railProgress.className = "topic-rail-progress";
      railTrack.appendChild(railProgress);

      const railList = document.createElement("ol");
      railList.className = "topic-rail-list";

      const links = sections.map((section, index) => {
        const marker = String(index + 1).padStart(2, "0");
        const heading = section.querySelector("h3");
        if (!heading) return null;

        const numberNode = heading.querySelector(".num") ?? heading.insertBefore(document.createElement("span"), heading.firstChild);
        numberNode.classList.add("num");
        numberNode.textContent = marker;

        const sectionTitle = extractHeadingLabel(heading);
        const sectionId = section.id || `${panel.id}-section-${marker}`;
        section.id = sectionId;
        section.dataset.marker = marker;

        const item = document.createElement("li");
        item.className = "topic-rail-item";

        const link = document.createElement("button");
        link.type = "button";
        link.className = "topic-rail-link";
        link.dataset.target = sectionId;
        link.innerHTML = `
          <span class="topic-rail-index">${marker}</span>
          <span class="topic-rail-label">${sectionTitle}</span>
        `;
        link.addEventListener("click", () => {
          document.getElementById(sectionId)?.scrollIntoView({
            behavior: reducedMotionQuery.matches ? "auto" : "smooth",
            block: "start",
          });
        });

        item.appendChild(link);
        railList.appendChild(item);
        return link;
      }).filter(Boolean);

      rail.append(railEyebrow, railTrack, railList);
      panel.insertBefore(rail, column);
      topicStates.set(panel, { rail, railProgress, sections, links });
    });
  }

  function syncTopicRail() {
    const activePanel = content.querySelector(".topic-tab.active");
    if (!activePanel) return;

    const state = topicStates.get(activePanel);
    if (!state) return;

    const viewportLead = Math.max(96, activePanel.clientHeight * 0.22);
    let activeIndex = 0;

    state.sections.forEach((section, index) => {
      if (section.offsetTop <= activePanel.scrollTop + viewportLead) {
        activeIndex = index;
      }
    });

    state.links.forEach((link, index) => {
      const isActive = index === activeIndex;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    const maxScroll = Math.max(activePanel.scrollHeight - activePanel.clientHeight, 1);
    const progress = Math.min(activePanel.scrollTop / maxScroll, 1);
    state.railProgress.style.setProperty("--topic-progress", `${progress * 100}%`);
  }
}

function extractHeadingLabel(heading) {
  const clone = heading.cloneNode(true);
  clone.querySelector(".num")?.remove();
  return clone.textContent?.replace(/\s+/g, " ").trim() || "Section";
}

function shouldIgnoreTabHotkeys(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, option, [contenteditable=\"true\"]")) {
    return true;
  }
  return false;
}

function getKeyboardScrollTarget(activePanel, content) {
  if (activePanel instanceof HTMLElement && isScrollable(activePanel)) {
    return activePanel;
  }

  if (content instanceof HTMLElement && isScrollable(content)) {
    return content;
  }

  return window;
}

function isScrollable(element) {
  return element.scrollHeight > element.clientHeight + 1;
}

function focusKeyboardScrollTarget(target) {
  if (!(target instanceof HTMLElement)) return;
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  if (document.activeElement !== target) {
    target.focus({ preventScroll: true });
  }
}
