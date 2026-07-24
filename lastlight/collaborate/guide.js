const STORAGE_KEY = "lastlight:collaboration-guide:v1";
const checkboxes = [...document.querySelectorAll("[data-check]")];
const progressCount = document.querySelector("#progress-count");
const progressBar = document.querySelector("#progress-bar");
const resetButton = document.querySelector("#reset-progress");
const toast = document.querySelector("#copy-toast");
let toastTimer;

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeProgress() {
  const state = Object.fromEntries(checkboxes.map((box) => [box.dataset.check, box.checked]));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderProgress() {
  const complete = checkboxes.filter((box) => box.checked).length;
  progressCount.textContent = `${complete} / ${checkboxes.length}`;
  progressBar.style.width = `${(complete / checkboxes.length) * 100}%`;
}

const savedProgress = readProgress();
for (const checkbox of checkboxes) {
  checkbox.checked = Boolean(savedProgress[checkbox.dataset.check]);
  checkbox.addEventListener("change", () => {
    writeProgress();
    renderProgress();
  });
}
renderProgress();

resetButton?.addEventListener("click", () => {
  for (const checkbox of checkboxes) checkbox.checked = false;
  writeProgress();
  renderProgress();
  resetButton.textContent = "Checklist reset";
  setTimeout(() => { resetButton.textContent = "Reset checklist"; }, 1500);
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1500);
}

for (const button of document.querySelectorAll(".copy-button")) {
  button.addEventListener("click", async () => {
    const code = button.closest(".code-block")?.querySelector("code")?.textContent;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast("Copied to clipboard");
    } catch {
      showToast("Select the text to copy");
    }
  });
}

const sidebarLinks = [...document.querySelectorAll(".guide-sidebar nav a")];
const linkById = new Map(sidebarLinks.map((link) => [link.getAttribute("href").slice(1), link]));
const sections = [...document.querySelectorAll("[data-section]")];

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    for (const link of sidebarLinks) link.classList.remove("active");
    linkById.get(visible.target.id)?.classList.add("active");
  }, { rootMargin: "-20% 0px -64% 0px", threshold: [0, .1, .25] });
  for (const section of sections) observer.observe(section);
}
