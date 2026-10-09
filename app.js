/* DQCX Radar handheld board. Data comes from board.json produced by build.py. */
const DATA_URL = "./board.json?v=20261009T040021Z";

const BANDS = {
  pursuit_now: { short: "Pursue", long: "Pursuit now" },
  develop: { short: "Develop", long: "Develop" },
  monitor: { short: "Monitor", long: "Monitor" },
  intel_only: { short: "Intel", long: "Intel only" },
};

const BAND_CHIPS = [
  ["develop", "Develop"],
  ["monitor", "Monitor"],
  ["intel_only", "Intel"],
  ["pursuit_now", "Pursue"],
];

const QUICK_REGIONS = ["TX", "VA", "AZ", "GA", "OH", "Carolinas", "Other"];

const PURSUE_BANDS = new Set(["pursuit_now", "develop"]);

const LEVELS = [
  ["l0_date", "L0", "Design"],
  ["l1_date", "L1", "FAT"],
  ["l2_date", "L2", "Install"],
  ["l3_date", "L3", "Startup"],
  ["l4_date", "L4", "FPT"],
  ["l5_date", "L5", "IST"],
  ["l6_date", "L6", "Post"],
];

const PARTIES = [
  ["owner", "Owner"],
  ["developer", "Developer"],
  ["tenant", "Tenant"],
  ["gc", "GC"],
  ["mep", "MEP"],
  ["electrical_contractor", "Electrical"],
  ["mechanical_contractor", "Mechanical"],
  ["cxa_incumbent", "CxA incumbent"],
];

const ACRONYMS = {
  cx: "Cx",
  cxa: "CxA",
  gc: "GC",
  mw: "MW",
  it: "IT",
  ist: "IST",
  fat: "FAT",
  rfs: "RFS",
  cod: "COD",
  mep: "MEP",
  tab: "TAB",
  ai: "AI",
  hpc: "HPC",
  epc: "EPC",
  oem: "OEM",
  dqcx: "DQCX",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const state = {
  q: "",
  band: "all",
  geoKind: null,
  geo: null,
  overdue: false,
  callWeek: false,
};

let PROJECTS = [];
let META = {};
let OFFLINE = false;
let booted = false;
let listScroll = 0;
let quickSet = new Set(QUICK_REGIONS);

const $ = (sel) => document.querySelector(sel);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isBlank(value) {
  if (value == null) return true;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" || t.toLowerCase() === "unknown";
  }
  return false;
}

function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function todayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function fmtNum(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return Number.isInteger(value) ? value.toLocaleString("en-US") : String(value);
}

function fmtMoney(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return "$" + Math.round(value).toLocaleString("en-US");
}

function fmtDate(value) {
  const date = parseISODate(value);
  if (!date) return "";
  return MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
}

function fmtShort(date) {
  const today = todayLocal();
  if (date.getFullYear() === today.getFullYear()) {
    return MONTHS[date.getMonth()] + " " + date.getDate();
  }
  return MONTHS[date.getMonth()] + " " + date.getFullYear();
}

function fmtUpdated(value) {
  if (!value) return "";
  const date = parseISODate(String(value).slice(0, 10));
  if (!date) return String(value);
  return MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
}

function humanToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes(" ") || /[A-Z]/.test(raw)) return raw;
  return raw
    .split("_")
    .map((part) => {
      const key = part.toLowerCase();
      if (ACRONYMS[key]) return ACRONYMS[key];
      if (!part) return "";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function typeLabel(value) {
  if (isBlank(value)) return "Type unknown";
  const map = {
    hyperscale: "Hyperscale",
    colo: "Colo",
    "AI/HPC": "AI/HPC",
    enterprise: "Enterprise",
    expansion: "Expansion",
    "power-for-DC": "Power for DC",
    hyperscale_ai: "Hyperscale AI",
    ai_colo: "AI colo",
    "hyperscale/cloud": "Hyperscale / cloud",
    "hyperscale / colo": "Hyperscale / colo",
  };
  if (map[value]) return map[value];
  return humanToken(value);
}

function bandOf(project) {
  return BANDS[project.score_band] || { short: humanToken(project.score_band || "Score"), long: humanToken(project.score_band || "Score") };
}

function cssToken(value) {
  const token = String(value || "");
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : "x";
}

function placeLine(project) {
  const city = isBlank(project.city) ? "" : project.city;
  const regionState = isBlank(project.state) ? "" : project.state;
  const foreign = project.country && project.country !== "US" ? project.country : "";
  const loc = [city, regionState].filter(Boolean).join(", ");
  let text = loc;
  if (loc && foreign) text = loc + " · " + foreign;
  else if (!loc && foreign) text = foreign;
  if (!text) {
    if (!isBlank(project.region)) return project.region;
    return "Location unknown";
  }
  if (project.region && project.region !== regionState && project.region !== "Other" && project.region !== foreign) {
    text += " · " + project.region;
  }
  return text;
}

function whoLine(project) {
  const owner = isBlank(project.owner) ? "" : project.owner;
  const tenant = isBlank(project.tenant) ? "" : project.tenant;
  const developer = isBlank(project.developer) ? "" : project.developer;
  if (owner && tenant && tenant !== owner) return owner + " · " + tenant;
  if (owner) return owner;
  if (tenant) return tenant;
  if (developer) return developer;
  return "Owner unknown";
}

function dueInfo(project, today) {
  const date = parseISODate(project.next_action_due);
  if (!date) return null;
  const day = date.getTime();
  const start = today.getTime();
  const horizon = addDays(today, 7).getTime();
  if (day < start) return { cls: "overdue", text: "Overdue · " + fmtShort(date) };
  if (day === start) return { cls: "soon", text: "Due today" };
  if (day <= horizon) return { cls: "soon", text: "Due " + fmtShort(date) };
  return { cls: "", text: "Due " + fmtShort(date) };
}

function isOverdue(project, today) {
  const date = parseISODate(project.next_action_due);
  return !!(date && date.getTime() < today.getTime());
}

function isCallWeek(project, today) {
  if (!PURSUE_BANDS.has(project.score_band)) return false;
  const date = parseISODate(project.next_action_due);
  if (!date) return false;
  return date.getTime() <= addDays(today, 7).getTime();
}

function haystack(project) {
  const parts = [project.name, project.city, project.owner, project.tenant, project.developer, project.project_id];
  if (Array.isArray(project.aliases)) parts.push(...project.aliases);
  return parts
    .filter((part) => part != null && String(part).trim() !== "")
    .join(" ")
    .toLowerCase();
}

function matches(project, today) {
  if (state.band !== "all" && project.score_band !== state.band) return false;
  if (state.geoKind === "region" && project.region !== state.geo) return false;
  if (state.geoKind === "state" && project.state !== state.geo) return false;
  if (state.overdue && !isOverdue(project, today)) return false;
  if (state.callWeek && !isCallWeek(project, today)) return false;
  const tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const hay = haystack(project);
    if (!tokens.every((token) => hay.includes(token))) return false;
  }
  return true;
}

function safeHttpUrl(raw) {
  if (typeof raw !== "string") return "";
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch (err) {
    return "";
  }
}

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch (err) {
    return url;
  }
}

function parseRoute() {
  const raw = (location.hash || "").replace(/^#/, "");
  const match = /^\/p\/([^/?#]+)$/.exec(raw);
  if (!match) return { view: "list" };
  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch (err) {
    /* keep the raw segment */
  }
  return { view: "detail", id };
}

function findProject(id) {
  return PROJECTS.find((project) => project.project_id === id) || null;
}

function counts(projects) {
  const regions = new Map();
  const states = new Map();
  projects.forEach((project) => {
    if (project.region) regions.set(project.region, (regions.get(project.region) || 0) + 1);
    if (!isBlank(project.state)) states.set(project.state, (states.get(project.state) || 0) + 1);
  });
  const byCount = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const byName = (map) => [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return { regions: byCount(regions), states: byName(states) };
}

function filterNote() {
  const bits = [];
  if (state.callWeek) bits.push("call this week");
  if (state.overdue) bits.push("overdue");
  if (state.band !== "all") bits.push((BANDS[state.band] && BANDS[state.band].short) || state.band);
  if (state.geo) bits.push(state.geoKind === "state" ? "state " + state.geo : state.geo);
  return bits.length ? bits.join(" · ") : "hottest first";
}

function sheetButtonLabel() {
  if (state.geoKind === "state" && state.geo) return "State " + state.geo;
  if (state.geoKind === "region" && state.geo && !quickSet.has(state.geo)) return "Region " + state.geo;
  return "State";
}

function renderChips() {
  const { regions } = counts(PROJECTS);
  const present = new Set(regions.map(([name]) => name));
  const quick = QUICK_REGIONS.filter((name) => present.has(name));
  quickSet = new Set(quick);
  const buttons = [
    `<button type="button" class="chip" data-filter="all">All</button>`,
    `<button type="button" class="chip call" data-filter="call" aria-label="Call this week. Pursuit now and Develop, due within 7 days or overdue.">Call this week</button>`,
    `<button type="button" class="chip overdue" data-filter="overdue" aria-label="Overdue. Next action due before today.">Overdue</button>`,
  ];
  BAND_CHIPS.forEach(([value, label]) => {
    buttons.push(
      `<button type="button" class="chip" data-filter="band" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`
    );
  });
  quick.forEach((name) => {
    buttons.push(
      `<button type="button" class="chip" data-filter="region" data-value="${escapeHtml(name)}">${escapeHtml(name)}</button>`
    );
  });
  buttons.push(`<button type="button" class="chip" data-filter="sheet" id="sheet-open">State</button>`);
  $("#chips").innerHTML = buttons.join("");
  syncChips();
}

function syncChips() {
  document.querySelectorAll("#chips .chip").forEach((button) => {
    const filter = button.dataset.filter;
    let on = false;
    if (filter === "all") {
      on = state.band === "all" && !state.geoKind && !state.overdue && !state.callWeek;
    } else if (filter === "call") on = state.callWeek;
    else if (filter === "overdue") on = state.overdue;
    else if (filter === "band") on = state.band === button.dataset.value;
    else if (filter === "region") on = state.geoKind === "region" && state.geo === button.dataset.value;
    else if (filter === "sheet") {
      on = state.geoKind === "state" || (state.geoKind === "region" && state.geo && !quickSet.has(state.geo));
      button.textContent = sheetButtonLabel();
    }
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function renderList() {
  const today = todayLocal();
  const shown = PROJECTS.filter((project) => matches(project, today));
  const count = $("#count");
  count.textContent = shown.length + " / " + PROJECTS.length;
  count.setAttribute("aria-label", shown.length + " of " + PROJECTS.length + " campuses");

  const updated = $("#updated");
  const when = fmtUpdated(META.updated || META.built_at);
  let line = when ? "Board updated " + when : "Board loaded";
  line += " · " + filterNote();
  if (OFFLINE) line += " · offline copy";
  updated.textContent = line;
  updated.classList.toggle("offline", OFFLINE);

  const results = $("#results");
  if (!shown.length) {
    results.innerHTML = `<div class="empty"><p>No campuses match.</p><button type="button" id="clear-filters">Clear filters</button></div>`;
    return;
  }
  results.innerHTML = shown.map((project) => cardHtml(project, today)).join("");
}

function cardHtml(project, today) {
  const band = bandOf(project);
  const due = dueInfo(project, today);
  const who = whoLine(project);
  const itKnown = typeof project.it_mw === "number";
  const itText = itKnown ? fmtNum(project.it_mw) + " IT MW" : "IT MW unknown";
  const overdue = due && due.cls === "overdue";
  const id = encodeURIComponent(project.project_id);
  return `<a class="card${overdue ? " is-overdue" : ""}" href="#/p/${id}" data-project-id="${escapeHtml(project.project_id)}">
    <div class="card-top">
      <div class="card-copy">
        <h2 class="name">${escapeHtml(project.name || "Untitled")}</h2>
        <p class="where">${escapeHtml(placeLine(project))}</p>
        <p class="${who === "Owner unknown" ? "who unknown" : "who"}">${escapeHtml(who)}</p>
        <p class="mw"><span class="${itKnown ? "" : "unknown"}">${escapeHtml(itText)}</span> · ${escapeHtml(typeLabel(project.project_type))}</p>
      </div>
      <div class="scorebox band-${cssToken(project.score_band)}" aria-label="Score ${escapeHtml(project.opportunity_score)} ${escapeHtml(band.long)}">
        <div class="num">${escapeHtml(project.opportunity_score ?? "—")}</div>
        <div class="pill band-${cssToken(project.score_band)}">${escapeHtml(band.short)}</div>
      </div>
    </div>
    ${isBlank(project.status) ? "" : `<p class="status">${escapeHtml(project.status)}</p>`}
    <p class="next"><span class="k">Next</span>${escapeHtml(project.next_action || "—")}</p>
    ${due ? `<p class="due ${due.cls}">${escapeHtml(due.text)}</p>` : ""}
  </a>`;
}

function kvRow(label, value, hint) {
  const display = isBlank(value) && value !== 0 && value !== false
    ? `<span class="unknown">Unknown</span>`
    : escapeHtml(value);
  const extra = hint ? `<span class="hint">${escapeHtml(hint)}</span>` : "";
  return `<dt>${escapeHtml(label)}</dt><dd>${display}${extra}</dd>`;
}

function partyValue(value) {
  if (isBlank(value)) return null;
  return String(value);
}

function scheduleRows(project) {
  const rows = [];
  const windowStart = project.pursuit_window_start;
  const windowEnd = project.pursuit_window_end;
  if (windowStart || windowEnd) {
    let text = "";
    if (windowStart && windowEnd) text = fmtDate(windowStart) + " → " + fmtDate(windowEnd);
    else if (windowStart) text = "Opens " + fmtDate(windowStart);
    else text = "Closes " + fmtDate(windowEnd);
    rows.push(["Pursuit window", text]);
  }
  if (!isBlank(project.award_timing_note)) rows.push(["Award", project.award_timing_note]);
  if (project.announcement_date) rows.push(["Announced", fmtDate(project.announcement_date)]);
  if (project.rfs_cod_date) rows.push(["RFS / COD", fmtDate(project.rfs_cod_date)]);
  if (project.ist_date && project.ist_date !== project.l5_date) rows.push(["IST", fmtDate(project.ist_date)]);
  if (project.sitework_date) rows.push(["Sitework", fmtDate(project.sitework_date)]);
  if (project.shell_date) rows.push(["Shell", fmtDate(project.shell_date)]);
  if (project.permanent_power_date) rows.push(["Permanent power", fmtDate(project.permanent_power_date)]);
  return rows;
}

function levelRail(project) {
  const any = LEVELS.some(([key]) => project[key]);
  if (!any) return `<p class="gapnote">L0–L6 dates not sourced.</p>`;
  const items = LEVELS.map(([key, label, caption]) => {
    const value = project[key];
    const parsed = value ? parseISODate(value) : null;
    const has = !!parsed;
    return `<li class="${has ? "has" : ""}">
      <span class="lv">${label}</span>
      <span class="dot"></span>
      <span class="dt">${has ? escapeHtml(fmtShort(parsed)) : "—"}</span>
      <span class="cap">${caption}</span>
    </li>`;
  }).join("");
  return `<ol class="rail">${items}</ol>`;
}

function boolLabel(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return null;
}

function renderDetail(id) {
  const project = findProject(id);
  const mini = $("#mini-score");
  const body = $("#detail-body");
  if (!project) {
    mini.textContent = "";
    mini.className = "mini-score";
    document.title = "DQCX Radar";
    body.innerHTML = `<div class="empty"><p>That campus isn’t on this board.</p></div>`;
    return;
  }
  const band = bandOf(project);
  const due = dueInfo(project, todayLocal());
  document.title = project.name + " · DQCX Radar";
  mini.textContent = (project.opportunity_score ?? "—") + " · " + band.short;
  mini.className = "mini-score band-" + cssToken(project.score_band);

  const aliasText = Array.isArray(project.aliases) && project.aliases.length
    ? `<p class="aliases">Also ${escapeHtml(project.aliases.join(" · "))}</p>`
    : "";
  const idBits = [project.project_id];
  if (project.dq_number) idBits.push("DQ# " + project.dq_number);
  if (project.campus && project.campus !== project.name) idBits.push(project.campus);

  const actionClass = due && due.cls === "overdue" ? "action overdue" : "action";
  const dueHtml = due ? `<p class="due ${due.cls}">${escapeHtml(due.text)}</p>` : `<p class="due">No due date</p>`;

  const what = [];
  what.push(kvRow("IT MW", typeof project.it_mw === "number" ? fmtNum(project.it_mw) + " MW" : null));
  if (typeof project.critical_mw === "number") {
    what.push(kvRow("Critical MW", fmtNum(project.critical_mw) + " MW", "Critical power, not IT load"));
  }
  if (typeof project.buildings === "number") what.push(kvRow("Buildings", fmtNum(project.buildings)));
  const liquid = boolLabel(project.liquid_cool_flag);
  if (liquid) what.push(kvRow("Liquid cool", liquid));
  const density = boolLabel(project.density_flag);
  if (density) what.push(kvRow("High density", density));
  if (typeof project.value_usd === "number") what.push(kvRow("Value", fmtMoney(project.value_usd)));

  const status = isBlank(project.status)
    ? `<p class="unknown">Status unknown</p>`
    : project.status.length > 220
      ? `<p class="prose clamped" id="status-text">${escapeHtml(project.status)}</p><button type="button" class="textbtn" data-expand="status">Show full status</button>`
      : `<p class="prose">${escapeHtml(project.status)}</p>`;

  const parties = PARTIES.map(([key, label]) => kvRow(label, partyValue(project[key]))).join("");
  const extraParties = [];
  if (!isBlank(project.utility)) extraParties.push(kvRow("Utility", project.utility));
  if (!isBlank(project.tab)) extraParties.push(kvRow("TAB", project.tab));
  if (Array.isArray(project.oem_vendors) && project.oem_vendors.length) {
    extraParties.push(kvRow("OEMs", project.oem_vendors.join(", ")));
  }

  const sched = scheduleRows(project);
  const entry = isBlank(project.estimated_entry)
    ? ""
    : `<p class="entry">${escapeHtml(project.estimated_entry)}</p>`;
  const schedTable = sched.length ? `<dl class="kv">${sched.map(([label, value]) => kvRow(label, value)).join("")}</dl>` : "";

  const flags = Array.isArray(project.relationship_flags) ? project.relationship_flags.filter((flag) => !isBlank(flag)) : [];
  const blockers = Array.isArray(project.blockers) ? project.blockers.filter((flag) => !isBlank(flag)) : [];
  let flagBlock = "";
  if (flags.length || blockers.length) {
    const blockerHtml = blockers.length
      ? `<h3 class="subhead">Blockers</h3><div class="pills">${blockers.map((flag) => `<span class="blocker">${escapeHtml(humanToken(flag))}</span>`).join("")}</div>`
      : "";
    const flagHtml = flags.length
      ? `<h3 class="subhead">Relationship</h3><div class="pills">${flags.map((flag) => `<span class="flag">${escapeHtml(humanToken(flag))}</span>`).join("")}</div>`
      : "";
    flagBlock = `<section class="block"><h2>Flags</h2>${blockerHtml}${flagHtml}</section>`;
  }

  const sources = (Array.isArray(project.sources) ? project.sources : [])
    .map((source) => ({ source, href: safeHttpUrl(source && source.url) }))
    .filter((item) => item.href)
    .sort((a, b) => String(b.source.date || "").localeCompare(String(a.source.date || "")));
  const sourceHtml = sources.length
    ? sources.map(({ source, href }) => {
        const label = humanToken(source.type || "source");
        const when = source.date ? " · " + fmtDate(source.date) : "";
        const quote = isBlank(source.quote) ? "" : `<span class="quote">${escapeHtml(source.quote)}</span>`;
        return `<a class="source" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
          <span class="stype">${escapeHtml(label + when)}</span>
          <span class="host">${escapeHtml(hostOf(href))} ↗</span>
          ${quote}
        </a>`;
      }).join("")
    : `<p class="unknown">No public source link on file.</p>`;

  const scopeKeys = Object.keys(project).filter((key) => key.startsWith("scope_") && project[key] && project[key] !== "unknown");
  const scopeHtml = scopeKeys.length
    ? `<section class="block"><h2>Scope fit</h2><div class="pills">${scopeKeys.map((key) => {
        const name = humanToken(key.replace(/^scope_/, ""));
        return `<span class="flag">${escapeHtml(name)} · ${escapeHtml(humanToken(project[key]))}</span>`;
      }).join("")}</div></section>`
    : "";

  body.innerHTML = `
    <div class="hero">
      <p class="where">${escapeHtml(placeLine(project))}</p>
      <h1>${escapeHtml(project.name || "Untitled")}</h1>
      <div class="scoreline">
        <span class="num band-${cssToken(project.score_band)}">${escapeHtml(project.opportunity_score ?? "—")}</span>
        <span class="pill band-${cssToken(project.score_band)}">${escapeHtml(band.long)}</span>
        <span class="typepill">${escapeHtml(typeLabel(project.project_type))}</span>
      </div>
      <p class="idline">${escapeHtml(idBits.join(" · "))}</p>
      ${aliasText}
    </div>
    <section class="${actionClass}">
      <div class="kicker">Next action</div>
      <div class="body">${escapeHtml(project.next_action || "—")}</div>
      ${dueHtml}
    </section>
    <section class="block">
      <h2>Why this score</h2>
      <p class="rationale">${escapeHtml(project.score_rationale || "No rationale on file.")}</p>
    </section>
    <section class="block">
      <h2>What</h2>
      <dl class="kv">${what.join("")}</dl>
      <div class="status-block">${status}</div>
    </section>
    <section class="block">
      <h2>When</h2>
      ${entry || `<p class="unknown">Estimated entry not sourced.</p>`}
      ${schedTable}
      ${levelRail(project)}
    </section>
    <section class="block">
      <h2>Who</h2>
      <dl class="kv">${parties}${extraParties.join("")}</dl>
    </section>
    ${flagBlock}
    ${scopeHtml}
    <section class="block">
      <h2>Public sources</h2>
      ${sourceHtml}
    </section>
    <p class="foot">${escapeHtml($("#updated").textContent || "")}</p>
  `;
}

function rememberList() {
  try { sessionStorage.setItem("dqcxSeenList", "1"); } catch (err) { /* private mode */ }
}

function listWasSeen() {
  try { return sessionStorage.getItem("dqcxSeenList") === "1"; } catch (err) { return false; }
}

function renderRoute() {
  const route = parseRoute();
  const list = $("#list");
  const detail = $("#detail");
  if (route.view === "detail") {
    if (!list.hidden) listScroll = window.scrollY;
    list.hidden = true;
    detail.hidden = false;
    renderDetail(route.id);
    window.scrollTo(0, 0);
    const back = $("#back-btn");
    if (back) back.focus({ preventScroll: true });
  } else {
    detail.hidden = true;
    list.hidden = false;
    document.title = "DQCX Radar";
    rememberList();
    window.scrollTo(0, listScroll);
  }
}

function goBack() {
  if (!location.hash.startsWith("#/p/")) return;
  // history.back() only when this tab already showed the list. A campus
  // link opened directly still has the tab's previous history (often
  // about:blank), and back() would leave the site before any fallback runs.
  if (listWasSeen()) history.back();
  else location.replace("#/");
}

function clearFilters() {
  state.band = "all";
  state.geoKind = null;
  state.geo = null;
  state.overdue = false;
  state.callWeek = false;
  state.q = "";
  const input = $("#q");
  if (input) input.value = "";
  syncChips();
  renderList();
}

function openSheet() {
  const { regions, states } = counts(PROJECTS);
  const regionButtons = regions.map(([name, count]) => {
    const on = state.geoKind === "region" && state.geo === name;
    return `<button type="button" class="chip" data-sheet="region" data-value="${escapeHtml(name)}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(name)}<span class="n">${count}</span></button>`;
  }).join("");
  const stateButtons = states.map(([name, count]) => {
    const on = state.geoKind === "state" && state.geo === name;
    return `<button type="button" class="chip" data-sheet="state" data-value="${escapeHtml(name)}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(name)}<span class="n">${count}</span></button>`;
  }).join("");
  const anyOn = !state.geoKind;
  $("#sheet-body").innerHTML = `
    <p class="sheet-help">Region is the Radar bucket. Carolinas covers NC and SC. State is the site’s state code.</p>
    <h3>Region</h3>
    <div class="sheet-grid">
      <button type="button" class="chip" data-sheet="clear" aria-pressed="${anyOn ? "true" : "false"}">Any</button>
      ${regionButtons}
    </div>
    <h3>State</h3>
    <div class="sheet-grid">${stateButtons}</div>
  `;
  $("#sheet").hidden = false;
  document.body.classList.add("lock");
  $("#sheet-close").focus();
}

function closeSheet() {
  $("#sheet").hidden = true;
  document.body.classList.remove("lock");
  const opener = $("#sheet-open");
  if (opener) opener.focus();
}

function applySheetChoice(kind, value) {
  if (kind === "clear") {
    state.geoKind = null;
    state.geo = null;
  } else {
    state.geoKind = kind;
    state.geo = value;
  }
  closeSheet();
  syncChips();
  renderList();
  window.scrollTo(0, 0);
}

async function loadBoard() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Board request failed");
  OFFLINE = response.headers.get("X-DQCX-Source") === "cache";
  const data = await response.json();
  if (!data || !Array.isArray(data.projects)) throw new Error("Board file is not valid");
  META = data;
  PROJECTS = data.projects.slice().sort((a, b) => {
    const as = typeof a.opportunity_score === "number" ? a.opportunity_score : -1;
    const bs = typeof b.opportunity_score === "number" ? b.opportunity_score : -1;
    if (bs !== as) return bs - as;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function showError() {
  $("#updated").textContent = "Couldn’t load the board.";
  $("#results").innerHTML = `<div class="empty"><p>Couldn’t load the board. Check the connection and try again.</p><button type="button" id="retry">Retry</button></div>`;
}

function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) location.reload();
  });
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function setupInstall() {
  const slot = $("#install-slot");
  if (!slot) return;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios && !standalone) {
    slot.textContent = "Add to Home Screen: Share, then Add to Home Screen.";
    return;
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "install-btn";
    button.textContent = "Install DQCX Radar";
    button.addEventListener("click", async () => {
      button.hidden = true;
      event.prompt();
      try { await event.userChoice; } catch (err) { /* dismissed */ }
    });
    slot.replaceChildren(button);
  });
}

function wire() {
  $("#q").addEventListener("input", () => {
    state.q = $("#q").value || "";
    if (booted) {
      renderList();
      if (!$("#list").hidden) window.scrollTo(0, 0);
    }
  });
  $("#chips").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const filter = button.dataset.filter;
    if (filter === "all") {
      state.band = "all";
      state.geoKind = null;
      state.geo = null;
      state.overdue = false;
      state.callWeek = false;
    } else if (filter === "call") state.callWeek = !state.callWeek;
    else if (filter === "overdue") state.overdue = !state.overdue;
    else if (filter === "band") state.band = state.band === button.dataset.value ? "all" : button.dataset.value;
    else if (filter === "region") {
      if (state.geoKind === "region" && state.geo === button.dataset.value) {
        state.geoKind = null;
        state.geo = null;
      } else {
        state.geoKind = "region";
        state.geo = button.dataset.value;
      }
    } else if (filter === "sheet") {
      openSheet();
      return;
    }
    syncChips();
    renderList();
    if (!$("#list").hidden) window.scrollTo(0, 0);
    button.scrollIntoView({ inline: "center", block: "nearest" });
  });
  $("#results").addEventListener("click", (event) => {
    if (event.target.closest("#clear-filters")) {
      clearFilters();
      return;
    }
    if (event.target.closest("#retry")) location.reload();
  });
  $("#back-btn").addEventListener("click", goBack);
  $("#detail-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-expand]");
    if (!button) return;
    const text = $("#status-text");
    if (!text) return;
    text.classList.toggle("clamped");
    button.textContent = text.classList.contains("clamped") ? "Show full status" : "Show less";
  });
  $("#sheet-close").addEventListener("click", closeSheet);
  $("#sheet").addEventListener("click", (event) => {
    if (event.target === $("#sheet")) closeSheet();
    const choice = event.target.closest("[data-sheet]");
    if (!choice) return;
    applySheetChoice(choice.dataset.sheet, choice.dataset.value || null);
  });
  window.addEventListener("hashchange", () => {
    if (booted) renderRoute();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!$("#sheet").hidden) {
        closeSheet();
        return;
      }
      if (location.hash.startsWith("#/p/")) goBack();
      return;
    }
    if (event.key === "/" && document.activeElement !== $("#q") && !$("#list").hidden) {
      event.preventDefault();
      $("#q").focus();
    }
  });

  let tracking = false;
  let startX = 0;
  let startY = 0;
  document.addEventListener("touchstart", (event) => {
    if (!location.hash.startsWith("#/p/")) return;
    const touch = event.changedTouches[0];
    if (!touch || touch.clientX > 24) return;
    if (event.target.closest(".chips, .rail, .sheet")) return;
    tracking = true;
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });
  document.addEventListener("touchend", (event) => {
    if (!tracking) return;
    tracking = false;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (dx > 72 && Math.abs(dy) < 48) goBack();
  }, { passive: true });
}

async function init() {
  registerWorker();
  setupInstall();
  wire();
  // This document opened on a campus link, so an earlier visit's flag
  // must not count as "the list is the previous history entry".
  if (parseRoute().view === "detail") {
    try { sessionStorage.removeItem("dqcxSeenList"); } catch (err) { /* private mode */ }
  }
  try {
    await loadBoard();
    booted = true;
    renderChips();
    renderList();
    renderRoute();
  } catch (err) {
    showError();
  }
}

init();
