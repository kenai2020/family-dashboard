const DATA_URL = "data/dashboard.json";
const REFRESH_DATA_MS = 5 * 60 * 1000;
const PHOTO_ROTATE_MS = 30 * 1000;
const STAGE_W = 1280;
const STAGE_H = 800;

const WEATHER_ICONS = {
  "sunny": "☀️",
  "partly-cloudy": "⛅",
  "cloudy": "☁️",
  "rain": "🌧️",
  "storm": "⛈️",
  "snow": "❄️",
  "fog": "🌫️"
};

let photos = [];
let photoIndex = 0;
let peopleById = {};
let latestData = null;

/* ---------- Scale the fixed-size stage to fit any real screen ---------- */
function fitStage() {
  const stage = document.getElementById("stage");
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const w = STAGE_W * scale;
  const h = STAGE_H * scale;
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${Math.round((window.innerWidth - w) / 2)}px`;
  stage.style.top = `${Math.round((window.innerHeight - h) / 2)}px`;
}
window.addEventListener("resize", fitStage);

/* ---------- Page navigation ---------- */
function gotoPage(pageName) {
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("is-active", el.dataset.page === pageName);
  });
  document.querySelectorAll(".page").forEach(el => {
    el.classList.toggle("is-active", el.dataset.page === pageName);
  });
}

function wireNav() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => gotoPage(btn.dataset.page));
  });
  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => gotoPage(btn.dataset.goto));
  });
}

/* ---------- Clock ---------- */
function updateClock() {
  const now = new Date();
  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const hm = `${h}:${String(now.getMinutes()).padStart(2, "0")}`;

  document.getElementById("time-main").textContent = hm;
  document.getElementById("time-ampm").textContent = ampm;
  document.getElementById("date-day").textContent = now.toLocaleDateString([], { weekday: "long" }).toUpperCase();
  document.getElementById("date-rest").textContent = now.toLocaleDateString([], { month: "long", day: "numeric" });
  document.getElementById("nav-clock").textContent = `${hm} ${ampm}`;
}

/* ---------- Today page ---------- */
function renderWeather(weather) {
  const el = document.getElementById("h-weather");
  if (!weather) { el.innerHTML = ""; return; }
  const hours = (weather.hourly || []).map(h => `
    <div class="h-hr ${h.wet ? "is-wet" : ""}">
      <span class="h-hr-l">${h.label}</span>
      <span class="h-hr-i">${WEATHER_ICONS[h.icon] || ""}</span>
      <b>${Math.round(h.temp_f)}°</b>
    </div>
  `).join("");
  el.innerHTML = `
    <div class="h-wx-top">
      <span class="h-wx-icon">${WEATHER_ICONS[weather.icon] || ""}</span>
      <span class="h-wx-temp num">${Math.round(weather.current_temp_f)}°</span>
      <span class="h-wx-meta"><b>${(weather.condition || "").toUpperCase()}</b><br>H ${weather.high_f}° L ${weather.low_f}°</span>
    </div>
    ${weather.note ? `<div class="h-wx-say">${weather.note}</div>` : ""}
    <div class="h-wx-hours">${hours}</div>
  `;
}

function renderPresence(people) {
  const el = document.getElementById("h-presence");
  el.innerHTML = (people || []).map(p => {
    const home = (p.status || "").toLowerCase() === "home";
    const statusText = p.eta_min != null ? `ETA ${p.eta_min} min` : (p.status || "");
    return `
      <div class="h-who ${home ? "is-home" : ""}">
        <span class="avatar ${home ? "" : "avatar--away"}" style="--c:${p.color}">${p.initial}</span>
        <span><b>${p.name.toUpperCase()}</b><small>${statusText}</small></span>
      </div>
    `;
  }).join("");
}

function renderHero(nextUp) {
  const slot = document.getElementById("h-hero-slot");
  if (!nextUp) { slot.innerHTML = ""; return; }
  const person = peopleById[nextUp.person_id];
  const color = person ? person.color : "#ff9500";
  slot.innerHTML = `
    <button class="h-hero" style="--heroColor:${color}" data-goto="calendar">
      <div class="h-hero-main">
        <div class="h-hero-eyebrow">NEXT UP · ${person ? person.name.toUpperCase() : ""}</div>
        <div class="h-hero-title">${nextUp.title}</div>
        <div class="h-hero-sub">${nextUp.time_range}${nextUp.location ? " · " + nextUp.location : ""}</div>
        ${nextUp.leave_in_min != null ? `<div class="h-hero-btn">🚗 Leave in ${nextUp.leave_in_min} min</div>` : ""}
      </div>
      <div class="h-hero-count">
        <div class="num">${nextUp.minutes_until}</div>
        <div class="lbl">MIN</div>
      </div>
    </button>
  `;
  slot.querySelector("[data-goto]").addEventListener("click", () => gotoPage("calendar"));
}

function renderLanes(lanes) {
  const el = document.getElementById("h-lanes");
  el.innerHTML = (lanes || []).map(lane => {
    const person = peopleById[lane.person_id] || { name: "?", initial: "?", color: "#999" };
    const events = (lane.events || []).slice(0, 3).map(ev => `
      <button class="h-ev" data-goto="calendar">
        <span class="h-ev-n">${ev.time}</span>
        <span class="ev-title">${ev.title}</span>
      </button>
    `).join("");
    const extra = (lane.events || []).length > 3
      ? `<button class="h-more" data-goto="calendar">+${lane.events.length - 3} MORE</button>`
      : "";
    return `
      <div class="h-lane">
        <div class="h-lane-head"><span class="avatar" style="--c:${person.color}">${person.initial}</span>${person.name.toUpperCase()}</div>
        ${events}${extra}
      </div>
    `;
  }).join("");
  el.querySelectorAll("[data-goto]").forEach(btn => btn.addEventListener("click", () => gotoPage("calendar")));
}

function renderPhotoCaption(pod) {
  document.getElementById("photo-cap").textContent = pod && pod.caption ? pod.caption : "";
  const sub = [pod && pod.subcaption, pod && pod.location].filter(Boolean).join(" · ");
  document.getElementById("photo-loc").textContent = sub;
}

function renderChoresSummary(chores) {
  document.getElementById("chores-label").textContent = (chores && chores.label) || "CHORES";
  const el = document.getElementById("h-rings");
  el.innerHTML = ((chores && chores.rings) || []).map(r => {
    const person = peopleById[r.person_id] || { name: "Anyone", initial: "?", color: "#7a756b" };
    const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
    return `
      <div class="h-ring">
        <div class="ring-visual" style="--c:${person.color};--pct:${pct}"><span>${r.done}/${r.total}</span></div>
        ${person.name}
      </div>
    `;
  }).join("");
}

function renderShoppingSummary(shopping) {
  document.getElementById("shop-count").textContent = (shopping && shopping.count) || 0;
  const el = document.getElementById("shop-recent");
  el.innerHTML = ((shopping && shopping.recent) || []).slice(0, 4).map(i => `<li>${i}</li>`).join("");
}

function renderHomeStatusSummary(status) {
  if (!status) return;
  document.getElementById("status-lights").textContent = `${status.lights_on} light${status.lights_on === 1 ? "" : "s"} on`;
  document.getElementById("status-locks").textContent = status.all_locked ? "All locked" : "Unlocked";
  document.getElementById("status-temp").textContent = `${status.inside_temp_f}° inside`;
}

function rotatePhoto() {
  const slide = document.getElementById("photo-slide");
  if (!photos.length) return;
  slide.style.backgroundImage = `url("${photos[photoIndex]}")`;
  photoIndex = (photoIndex + 1) % photos.length;
}

/* ---------- Calendar page ---------- */
function renderCalendarPage(calendar) {
  document.getElementById("cal-date").textContent = new Date().toLocaleDateString([], {
    weekday: "long", month: "long", day: "numeric"
  });
  const el = document.getElementById("cal-list");
  const items = calendar || [];
  if (!items.length) {
    el.innerHTML = `<div class="cal-row"><span class="cal-title">Nothing on the calendar</span></div>`;
    return;
  }
  el.innerHTML = items.map(ev => {
    const person = peopleById[ev.person_id] || { name: "", initial: "?", color: "#999" };
    const dateLabel = ev.date ? new Date(ev.date + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "";
    return `
      <div class="cal-row">
        <span class="cal-time">${ev.time || ""}</span>
        <span class="cal-title">${ev.title}${ev.location ? " — " + ev.location : ""}</span>
        <span class="cal-who"><span class="avatar" style="--c:${person.color};width:22px;height:22px;font-size:11px">${person.initial}</span>${dateLabel}</span>
      </div>
    `;
  }).join("");
}

/* ---------- Chores page ---------- */
function renderChoresPage(chores) {
  document.getElementById("chores-page-sub").textContent = (chores && chores.label) || "";
  const el = document.getElementById("chores-board");
  const cols = (chores && chores.columns) || [];
  if (!cols.length) {
    el.innerHTML = `<div class="chores-col">Nothing assigned yet</div>`;
    return;
  }
  el.innerHTML = cols.map(col => {
    const person = peopleById[col.person_id] || { name: "Anyone", initial: "?", color: "#7a756b" };
    const items = (col.items || []).map(i => `
      <div class="chore-item ${i.done ? "is-done" : ""}">
        <span class="chore-check">${i.done ? "✓" : ""}</span>
        ${i.task}
      </div>
    `).join("");
    return `
      <div class="chores-col">
        <div class="chores-col-head"><span class="avatar" style="--c:${person.color}">${person.initial}</span>${person.name}</div>
        ${items}
      </div>
    `;
  }).join("");
}

/* ---------- Shopping page ---------- */
function renderShoppingPage(shopping) {
  document.getElementById("shop-page-sub").textContent = `${(shopping && shopping.count) || 0} items to get`;
  const el = document.getElementById("shop-list-full");
  const items = (shopping && shopping.items) || [];
  if (!items.length) {
    el.innerHTML = `<li>List is empty</li>`;
    return;
  }
  el.innerHTML = items.map(i => `
    <li class="${i.done ? "is-done" : ""}"><span class="shop-dot"></span>${i.item}</li>
  `).join("");
}

/* ---------- Home page ---------- */
function renderHomePage(status) {
  const el = document.getElementById("home-status-grid");
  if (!status) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="home-tile">
      <div class="label">Lights</div>
      <div class="tile-value">${status.lights_on}</div>
      <div class="tile-sub">light${status.lights_on === 1 ? "" : "s"} currently on</div>
    </div>
    <div class="home-tile">
      <div class="label">Locks</div>
      <div class="tile-value">${status.all_locked ? "Locked" : "Unlocked"}</div>
      <div class="tile-sub">${status.all_locked ? "Everything's secure" : "Check the doors"}</div>
    </div>
    <div class="home-tile">
      <div class="label">Temperature</div>
      <div class="tile-value">${status.inside_temp_f}°</div>
      <div class="tile-sub">inside</div>
    </div>
  `;
}

/* ---------- Load + render all ---------- */
async function loadData() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    latestData = data;

    peopleById = {};
    (data.people || []).forEach(p => { peopleById[p.id] = p; });

    renderWeather(data.weather);
    renderPresence(data.people);
    renderHero(data.next_up);
    renderLanes(data.lanes);
    renderPhotoCaption(data.photo_of_the_day);
    renderChoresSummary(data.chores);
    renderShoppingSummary(data.shopping);
    renderHomeStatusSummary(data.home_status);

    renderCalendarPage(data.calendar);
    renderChoresPage(data.chores);
    renderShoppingPage(data.shopping);
    renderHomePage(data.home_status);

    photos = data.photos || [];
    if (photos.length && !document.getElementById("photo-slide").style.backgroundImage) {
      rotatePhoto();
    }
  } catch (err) {
    console.error("Failed to load dashboard data", err);
  }
}

fitStage();
wireNav();
updateClock();
setInterval(updateClock, 15 * 1000);

loadData();
setInterval(loadData, REFRESH_DATA_MS);
setInterval(rotatePhoto, PHOTO_ROTATE_MS);
