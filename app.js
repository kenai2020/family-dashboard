const DATA_URL = "data/dashboard.json";
const REFRESH_DATA_MS = 5 * 60 * 1000; // re-fetch dashboard.json every 5 min
const PHOTO_ROTATE_MS = 30 * 1000; // change photo every 30s

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

function updateClock() {
  const now = new Date();
  document.getElementById("time").textContent = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
  document.getElementById("date").textContent = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function renderWeather(weather) {
  if (!weather) return;
  document.getElementById("weather-icon").textContent = WEATHER_ICONS[weather.icon] || "";
  document.getElementById("weather-temp").textContent = `${Math.round(weather.current_temp_f)}°`;
  document.getElementById("weather-condition").textContent =
    `${weather.condition} · H:${weather.high_f}° L:${weather.low_f}°`;

  const forecastEl = document.getElementById("weather-forecast");
  forecastEl.innerHTML = "";
  (weather.forecast || []).forEach(day => {
    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `<strong>${day.day}</strong>${WEATHER_ICONS[day.icon] || ""}<br>${day.high_f}°/${day.low_f}°`;
    forecastEl.appendChild(div);
  });
}

function renderCalendar(events) {
  const list = document.getElementById("calendar-list");
  list.innerHTML = "";
  if (!events || events.length === 0) {
    list.innerHTML = "<li>Nothing coming up</li>";
    return;
  }
  events.slice(0, 6).forEach(ev => {
    const li = document.createElement("li");
    const dateLabel = new Date(ev.date + "T00:00:00").toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    li.innerHTML = `<span>${ev.title}</span><span class="meta">${dateLabel}${ev.time ? " · " + ev.time : ""}</span>`;
    list.appendChild(li);
  });
}

function renderChores(chores) {
  const list = document.getElementById("chores-list");
  list.innerHTML = "";
  if (!chores || chores.length === 0) {
    list.innerHTML = "<li>No chores listed</li>";
    return;
  }
  chores.forEach(c => {
    const li = document.createElement("li");
    if (c.done) li.classList.add("done");
    li.innerHTML = `<span>${c.task}</span><span class="who">${c.who}</span>`;
    list.appendChild(li);
  });
}

function renderShopping(items) {
  const list = document.getElementById("shopping-list");
  list.innerHTML = "";
  if (!items || items.length === 0) {
    list.innerHTML = "<li>List is empty</li>";
    return;
  }
  items.forEach(i => {
    const li = document.createElement("li");
    if (i.done) li.classList.add("done");
    li.innerHTML = `<span>${i.item}</span>`;
    list.appendChild(li);
  });
}

function rotatePhoto() {
  const layer = document.getElementById("photo-layer");
  if (!photos.length) return;
  layer.style.backgroundImage = `url("${photos[photoIndex]}")`;
  photoIndex = (photoIndex + 1) % photos.length;
}

async function loadData() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    renderWeather(data.weather);
    renderCalendar(data.calendar);
    renderChores(data.chores);
    renderShopping(data.shopping_list);
    photos = (data.photos || []).map(p => (typeof p === "string" ? p : p.url));
    if (photos.length && !document.getElementById("photo-layer").style.backgroundImage) {
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
