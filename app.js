const DATA_URL = "data/dashboard.json";
const REFRESH_DATA_MS = 5 * 60 * 1000;
const PHOTO_ROTATE_MS = 30 * 1000;

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

function updateClock() {
  const now = new Date();
  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  document.getElementById("time-main").textContent = `${h}:${String(now.getMinutes()).padStart(2, "0")}`;
  document.getElementById("time-ampm").textContent = ampm;
  document.getElementById("date-day").textContent = now.toLocaleDateString([], { weekday: "long" }).toUpperCase();
  document.getElementById("date-rest").textContent = now.toLocaleDateString([], { month: "long", day: "numeric" });
}

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
    <button class="h-hero" style="--heroColor:${color}">
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
}

function renderLanes(lanes) {
  const el = document.getElementById("h-lanes");
  el.innerHTML = (lanes || []).map(lane => {
    const person = peopleById[lane.person_id] || { name: "?", initial: "?", color: "#999" };
    const events = (lane.events || []).slice(0, 3).map(ev => `
      <button class="h-ev">
        <span class="h-ev-n">${ev.time}</span>
        <span class="ev-title">${ev.title}</span>
      </button>
    `).join("");
    const extra = (lane.events || []).length > 3 ? `<button class="h-more">+${lane.events.length - 3} MORE</button>` : "";
    return `
      <div class="h-lane">
        <div class="h-lane-head"><span class="avatar" style="--c:${person.color}">${person.initial}</span>${person.name.toUpperCase()}</div>
        ${events}${extra}
      </div>
    `;
  }).join("");
}

function renderPhotoCaption(pod) {
  document.getElementById("photo-cap").textContent = pod && pod.caption ? pod.caption : "";
  const sub = [pod && pod.subcaption, pod && pod.location].filter(Boolean).join(" · ");
  document.getElementById("photo-loc").textContent = sub;
}

function renderChores(chores) {
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

function renderShopping(shopping) {
  document.getElementById("shop-count").textContent = (shopping && shopping.count) || 0;
  const el = document.getElementById("shop-recent");
  el.innerHTML = ((shopping && shopping.recent) || []).slice(0, 4).map(i => `<li>${i}</li>`).join("");
}

function renderHomeStatus(status) {
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

async function loadData() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();

    peopleById = {};
    (data.people || []).forEach(p => { peopleById[p.id] = p; });

    renderWeather(data.weather);
    renderPresence(data.people);
    renderHero(data.next_up);
    renderLanes(data.lanes);
    renderPhotoCaption(data.photo_of_the_day);
    renderChores(data.chores);
    renderShopping(data.shopping);
    renderHomeStatus(data.home_status);

    photos = data.photos || [];
    if (photos.length && !document.getElementById("photo-slide").style.backgroundImage) {
      rotatePhoto();
    }
  } catch (err) {
    console.error("Failed to load dashboard data", err);
  }
}

updateClock();
setInterval(updateClock, 15 * 1000);

loadData();
setInterval(loadData, REFRESH_DATA_MS);
setInterval(rotatePhoto, PHOTO_ROTATE_MS);
