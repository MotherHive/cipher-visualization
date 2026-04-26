export function initTopicTabs() {
  const tabNav = document.getElementById("tab-nav");
  const content = document.getElementById("content");
  if (!tabNav || !content) return;

  const tabButtons = tabNav.querySelectorAll(".tab-btn");

  function activate(tabId) {
    tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    content.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === tabId);
    });
    content.scrollTop = 0;
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      if (target) activate(target);
    });
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
      activate("crypto-solver");
    });
  });
}
