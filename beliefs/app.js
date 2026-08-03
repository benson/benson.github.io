const beliefs = window.BELIEFS || [];
const search = document.querySelector("#search");
const status = document.querySelector("#status");
const domain = document.querySelector("#domain");
const count = document.querySelector("#count");
const list = document.querySelector("#belief-list");
const detail = document.querySelector("#belief-detail");
let selectedId = location.hash.slice(1) || beliefs[0]?.id;

const titleCase = (value) => value.replaceAll("-", " ");

for (const name of [...new Set(beliefs.map((belief) => belief.domain))].sort()) {
  domain.add(new Option(name, name));
}

function filteredBeliefs() {
  const query = search.value.trim().toLowerCase();
  return beliefs.filter((belief) => {
    const statusMatches =
      status.value === "all" ||
      (status.value === "current" && ["endorsed", "foundational"].includes(belief.status)) ||
      belief.status === status.value;
    return statusMatches &&
      (domain.value === "all" || belief.domain === domain.value) &&
      (!query || belief.searchText.includes(query));
  });
}

function element(name, options = {}) {
  const node = document.createElement(name);
  if (options.className) node.className = options.className;
  if (options.text) node.textContent = options.text;
  return node;
}

function renderDetail(belief) {
  detail.replaceChildren();
  if (!belief) {
    detail.append(
      element("h2", { text: "no recorded position" }),
      element("p", {
        className: "muted",
        text: "the repository does not establish what i think about that.",
      }),
    );
    return;
  }

  const meta = element("p", {
    className: "meta",
    text: `${belief.domain} · ${belief.status} · ${belief.confidence} confidence`,
  });
  const heading = element("h2", { text: belief.title });
  const points = element("ul", { className: "position" });
  for (const point of belief.currentPoints) points.append(element("li", { text: point }));
  detail.append(meta, heading, points);

  if (belief.notYetSettled.length) {
    const open = element("details");
    open.append(element("summary", { text: "not yet settled" }));
    const openList = element("ul", { className: "unsettled" });
    for (const point of belief.notYetSettled) openList.append(element("li", { text: point }));
    open.append(openList);
    detail.append(open);
  }

  if (belief.references?.length) {
    const referenceSection = element("section", { className: "references" });
    referenceSection.append(element("h3", { text: "references" }));
    const referenceList = element("ul");
    for (const reference of belief.references) {
      const link = element("a", { text: reference.label });
      link.href = reference.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      const item = element("li");
      item.append(link);
      referenceList.append(item);
    }
    referenceSection.append(referenceList);
    detail.append(referenceSection);
  }

  const isLocal = location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  if (isLocal) {
    const source = element("a", { className: "source", text: "read the markdown card ↗" });
    source.href = belief.githubUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    detail.append(source);
  }
}

function render() {
  const filtered = filteredBeliefs();
  if (!filtered.some((belief) => belief.id === selectedId)) selectedId = filtered[0]?.id;
  count.textContent = `${filtered.length} ${filtered.length === 1 ? "position" : "positions"}`;
  list.replaceChildren();

  for (const belief of filtered) {
    const button = element("button", {
      className: belief.id === selectedId ? "selected" : "",
    });
    button.type = "button";
    button.append(
      element("strong", { text: belief.title }),
      element("small", { text: `${titleCase(belief.domain)} · ${belief.status}` }),
    );
    button.addEventListener("click", () => {
      selectedId = belief.id;
      history.replaceState(null, "", `#${belief.id}`);
      render();
    });
    const item = element("li");
    item.append(button);
    list.append(item);
  }

  renderDetail(filtered.find((belief) => belief.id === selectedId));
}

search.addEventListener("input", render);
status.addEventListener("change", render);
domain.addEventListener("change", render);
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== search) {
    event.preventDefault();
    search.focus();
  }
});
render();
