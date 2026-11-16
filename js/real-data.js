// Replaces upstream's data.js. That file builds window.DATA synchronously from fake mock data.
// We build window.DATA from data/dashboard.json instead -- fetched over the network, so this is
// async. main.js awaits window.DATA_READY before importing app.js and the view modules, since
// they all read window.DATA once at import time and expect it fully populated by then.
//
// IMPORTANT: once created, window.DATA is mutated in place on every refresh (fields reassigned,
// never window.DATA itself replaced), because app.js and every view module capture
// `var D = window.DATA` once at import time and keep using that same reference forever.

(function () {
  'use strict';

  var REFRESH_MS = 5 * 60 * 1000;

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(' ');
  }
  // Simple luminance check so light accent colors (e.g. amber/gold) get dark avatar text
  // automatically instead of invisible white-on-light text.
  function inkFor(hex) {
    var h = hex.replace('#', '');
    var n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#111111' : '#FFFFFF';
  }

  var DEFAULT_ROUTINES = [
    { id: 'morning', name: 'Morning', range: '6 – 11 AM', from: 0, to: 11 },
    { id: 'after', name: 'After school', range: '11 AM – 5 PM', from: 11, to: 17 },
    { id: 'evening', name: 'Evening', range: '5 – 10 PM', from: 17, to: 24 }
  ];

  // window.DATA exists immediately (so nothing can ever see it as undefined), starting empty.
  var DATA = window.DATA = {
    people: [], family: { id: 'family', name: 'Family', color: '#111111', rgb: '17 17 17', ink: '#FFFFFF' }, ALL: [],
    events: [], busyExtras: [],
    routines: DEFAULT_ROUTINES, chores: [], stars: {}, week: {},
    stores: [], catOrder: {}, groceries: [], catalog: [], usuals: [],
    weather: { hi: null, lo: null, feels: null, humidity: null, wind: null, t: new Array(24).fill(null), c: new Array(24).fill('cloud'), p: new Array(24).fill(0), outlook: [] },
    photos: [],
    home_status: { lights_on: 0, all_locked: true, inside_temp_f: null },
    recipes: [], meal_plan: {},
    _gid: function () { return 'g' + Math.random().toString(36).slice(2, 9); },
    _eid: function () { return 'e' + Math.random().toString(36).slice(2, 9); }
  };

  function parseEvent(e) {
    return Object.assign({}, e, { start: new Date(e.start), end: new Date(e.end) });
  }

  // ---------------------------------------------------------------- chore/star persistence
  // dashboard.json is re-fetched from GitHub every 5 minutes (and on load), which would otherwise
  // wipe out any chore someone just checked off and any stars just earned. Chores now live on a
  // Sun-Sat week grid (some daily, some weekly-on-one-day), so "done" is tracked per calendar
  // date rather than as a single flag on the chore itself -- that's what lets the week view show
  // Monday's history even after Tuesday's refresh. Stars are a running total that never resets
  // (only the chore checkmarks reset, daily or weekly depending on the chore), so they're kept
  // separately as one cumulative delta added on top of whatever dashboard.json says. All of this
  // lives in this browser's localStorage -- this dashboard only ever runs on the one photo frame,
  // so "this browser" effectively means "the frame".
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  var DAY_RECORD_PREFIX = 'fd_day_';
  var STARS_TOTAL_KEY = 'fd_stars_total';

  function readDayRecord(key) {
    try {
      var raw = localStorage.getItem(DAY_RECORD_PREFIX + key);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function writeDayRecord(key, rec) {
    try {
      localStorage.setItem(DAY_RECORD_PREFIX + key, JSON.stringify(rec));
      // Keep ~2 weeks of history so last week's chores don't linger forever in storage.
      var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(DAY_RECORD_PREFIX) !== 0) continue;
        var d = new Date(k.slice(DAY_RECORD_PREFIX.length) + 'T00:00:00');
        if (isNaN(d.getTime()) || d < cutoff) localStorage.removeItem(k);
      }
    } catch (e) { /* storage unavailable (private mode, quota, etc.) -- falls back to in-memory only */ }
  }
  function readStarsTotal() {
    try {
      var raw = localStorage.getItem(STARS_TOTAL_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function writeStarsTotal(t) {
    try { localStorage.setItem(STARS_TOTAL_KEY, JSON.stringify(t)); } catch (e) { /* ignore */ }
  }
  // Re-layers the running star total on top of freshly-fetched dashboard.json stars.
  function applyProgress() {
    var totals = readStarsTotal();
    Object.keys(totals).forEach(function (who) {
      if (DATA.stars[who] != null) DATA.stars[who] += totals[who];
    });
  }
  // Chores added from the UI (rather than written into dashboard.json by hand) also need to
  // survive the 5-minute refresh, since that refetches dashboard.json and would otherwise wipe
  // them out same as the done-checkmarks would be. Kept as a separate list and merged onto
  // whatever dashboard.json defines every time real.chores is applied.
  var CUSTOM_CHORES_KEY = 'fd_custom_chores';
  function readCustomChores() {
    try {
      var raw = localStorage.getItem(CUSTOM_CHORES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function writeCustomChores(list) {
    try { localStorage.setItem(CUSTOM_CHORES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  // Used by tasks.js: dateKey() for building the Su-Sat week; getRecord()/toggle() for reading
  // and writing a specific day's chore checkmarks (and the running star total alongside it);
  // addChore()/removeChore() for chores created on the Chores page itself.
  window.ChoreProgress = {
    dateKey: dateKey,
    getRecord: function (key, choreId) {
      return readDayRecord(key)[choreId] || null;
    },
    toggle: function (key, choreId, done, by, earner, stars) {
      var rec = readDayRecord(key);
      if (done) rec[choreId] = { by: by || null };
      else delete rec[choreId];
      writeDayRecord(key, rec);
      if (earner && stars) {
        var totals = readStarsTotal();
        totals[earner] = (totals[earner] || 0) + (done ? stars : -stars);
        writeStarsTotal(totals);
        if (DATA.stars[earner] != null) DATA.stars[earner] += (done ? stars : -stars);
      }
    },
    addChore: function (chore) {
      var list = readCustomChores();
      list.push(chore);
      writeCustomChores(list);
      DATA.chores.push(chore);
    },
    removeChore: function (choreId) {
      writeCustomChores(readCustomChores().filter(function (c) { return c.id !== choreId; }));
      DATA.chores = DATA.chores.filter(function (c) { return c.id !== choreId; });
    }
  };

  // ---------------------------------------------------------------- meal-plan persistence
  // Recipes themselves come from dashboard.json (the +recipe email task writes them there), but
  // which recipe is assigned to which day is set from the dashboard itself -- same 5-minute
  // refetch problem as chores, same fix: keep the date->recipe-id assignments in localStorage and
  // layer them on top of whatever (if anything) dashboard.json says, every time real.meal_plan is
  // applied. Keys are "YYYY-MM-DD" strings, same format as ChoreProgress's dateKey.
  var MEAL_PLAN_KEY = 'fd_meal_plan';
  function readMealPlan() {
    try { var raw = localStorage.getItem(MEAL_PLAN_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  function writeMealPlan(m) {
    try {
      // Keep ~2 weeks of history, same as chore day-records, so old weeks don't linger forever.
      var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
      Object.keys(m).forEach(function (k) {
        var d = new Date(k + 'T00:00:00');
        if (isNaN(d.getTime()) || d < cutoff) delete m[k];
      });
      localStorage.setItem(MEAL_PLAN_KEY, JSON.stringify(m));
    } catch (e) { /* storage unavailable -- falls back to in-memory only */ }
  }
  window.MealPlan = {
    set: function (key, recipeId) {
      var m = readMealPlan();
      if (recipeId) m[key] = recipeId; else delete m[key];
      writeMealPlan(m);
    }
  };

  function applyReal(real) {
    // window.DATA (= DATA = D in every other module) is one stable object; reassigning its
    // properties here is all that's needed -- just never reassign window.DATA itself.
    var people = (real.people || []).map(function (p) {
      return Object.assign({ rgb: hexToRgb(p.color), ink: p.ink || inkFor(p.color) }, p);
    });
    DATA.people = people;
    DATA.ALL = people.map(function (p) { return p.id; });
    if (real.family) DATA.family = Object.assign({}, DATA.family, real.family);

    DATA.events = (real.events || []).map(parseEvent);
    DATA.busyExtras = (real.busyExtras || []).map(parseEvent);

    if (real.routines && real.routines.length) DATA.routines = real.routines;

    DATA.chores = (real.chores || []).concat(readCustomChores());
    DATA.stars = real.stars || {};
    DATA.week = real.week || {};
    applyProgress(); // re-layer the running star total on top of the raw data file

    DATA.stores = real.stores || [];
    // catOrder must always have an "all" key (shopping.js looks up D.catOrder[V.store], and 'all'
    // is the default/only store when none are configured) -- derive one from the catalog's own
    // categories, in first-seen order, when it's missing from the data file.
    DATA.catOrder = real.catOrder || {};
    if (!DATA.catOrder.all) {
      var seen = [], cats = real.catalog || [];
      for (var i = 0; i < cats.length; i++) { if (seen.indexOf(cats[i][1]) === -1) seen.push(cats[i][1]); }
      DATA.catOrder.all = seen;
    }
    DATA.groceries = real.groceries || [];
    DATA.catalog = real.catalog || [];
    DATA.usuals = real.usuals || [];

    DATA.weather = Object.assign({}, DATA.weather, real.weather);
    DATA.photos = real.photos || [];
    DATA.home_status = Object.assign({}, DATA.home_status, real.home_status);
    DATA.recipes = real.recipes || [];
    DATA.meal_plan = Object.assign({}, real.meal_plan || {}, readMealPlan());
  }

  async function load() {
    var res = await fetch('data/dashboard.json?t=' + Date.now(), { cache: 'no-store' });
    var real = await res.json();
    applyReal(real);
  }

  // ---------------------------------------------------------------- weather (National Weather
  // Service -- api.weather.gov; free, no API key, US-only). The dashboard.json "weather" block
  // above is only a fallback shown until this first resolves.
  //
  // Zip 30501 (Gainesville, GA). If the family ever moves, update GEO and nothing else here needs
  // to change.
  var GEO = { lat: 34.3042, lon: -83.8269 };
  var weatherUrls = null; // resolved once from /points/, then reused (NWS asks that you not repeat that lookup every time)

  function classifyCond(shortForecast, isDaytime) {
    var s = (shortForecast || '').toLowerCase();
    if (/thunder|rain|shower|drizzle|snow|sleet|wintry/.test(s)) return 'rain'; // no snow icon; closest available
    if (/overcast|mostly cloudy|cloudy/.test(s)) return 'cloud';
    if (/partly|chance/.test(s)) return 'partly';
    return isDaytime ? 'sun' : 'moon'; // clear/sunny/fair and anything unrecognized
  }

  async function resolveWeatherUrls() {
    var res = await fetch('https://api.weather.gov/points/' + GEO.lat + ',' + GEO.lon);
    var j = await res.json();
    weatherUrls = { hourly: j.properties.forecastHourly, daily: j.properties.forecast };
  }

  async function fetchWeather() {
    if (!weatherUrls) await resolveWeatherUrls();

    var hourlyRes = await fetch(weatherUrls.hourly);
    var hourlyJ = await hourlyRes.json();
    var now = new Date(), today = now.toDateString();
    var t = DATA.weather.t.slice(), c = DATA.weather.c.slice(), p = DATA.weather.p.slice();
    hourlyJ.properties.periods.forEach(function (period) {
      var d = new Date(period.startTime);
      if (d.toDateString() !== today) return; // only today's 24 hours fill t/c/p (app indexes by getHours())
      var h = d.getHours();
      t[h] = period.temperature;
      c[h] = classifyCond(period.shortForecast, period.isDaytime);
      p[h] = (period.probabilityOfPrecipitation && period.probabilityOfPrecipitation.value) || 0;
    });

    var dailyRes = await fetch(weatherUrls.daily);
    var dailyJ = await dailyRes.json();
    var todays = dailyJ.properties.periods.filter(function (period) {
      return new Date(period.startTime).toDateString() === today;
    });
    var hiPeriod = todays.filter(function (period) { return period.isDaytime; })[0];
    var loPeriod = todays.filter(function (period) { return !period.isDaytime; })[0];

    // Multi-day outlook for the Weather detail page: NWS alternates day/night periods (12
    // periods ~= 6 days), each already carrying its own high/low, condition, and rain chance.
    var outlook = dailyJ.properties.periods.slice(0, 14).map(function (period) {
      return {
        start: period.startTime,
        name: period.name,
        isDaytime: period.isDaytime,
        temp: period.temperature,
        cond: classifyCond(period.shortForecast, period.isDaytime),
        short: period.shortForecast,
        pop: (period.probabilityOfPrecipitation && period.probabilityOfPrecipitation.value) || 0
      };
    });

    DATA.weather = Object.assign({}, DATA.weather, {
      t: t, c: c, p: p,
      hi: hiPeriod ? hiPeriod.temperature : DATA.weather.hi,
      lo: loPeriod ? loPeriod.temperature : DATA.weather.lo,
      outlook: outlook
    });
  }

  // On a cold boot (app launches the instant Android starts it, since it's the Home app), Wi-Fi
  // can still be associating when this first runs -- the page itself loads fine (that has its own
  // native-side retry), but these fetches have none, so a bad first attempt otherwise leaves
  // everything empty until the full 5-minute steady-state refresh comes around. Retry quickly a
  // few times instead, then fall back to spacing retries out.
  var RETRY_DELAYS_MS = [5000, 10000, 20000, 60000];
  function retryInitial(fn, label) {
    var attempt = 0;
    function tryOnce() {
      fn().then(function () {
        if (window.App) { window.App.emit('data'); window.App.rerender(); }
      }).catch(function (err) {
        var wait = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
        attempt++;
        console.error(label + ' failed (attempt ' + attempt + '); retrying in ' + (wait / 1000) + 's.', err);
        setTimeout(tryOnce, wait);
      });
    }
    tryOnce();
  }

  window.DATA_READY = load().then(function () {
    // Weather fetch runs AFTER load() resolves, and deliberately not awaited here: load()'s
    // applyReal() sets DATA.weather from dashboard.json's static fallback every time it runs, so
    // this must always happen strictly after it (not in parallel -- a parallel race could let the
    // static fallback overwrite real numbers depending on which settles last). Not awaiting it
    // means DATA_READY itself (and app startup) isn't held up waiting on a third-party API; the
    // static fallback covers the brief gap until this resolves and repaints.
    fetchWeather().then(function () {
      if (window.App) { window.App.emit('data'); window.App.rerender(); }
    }).catch(function (err) {
      console.error('Initial weather fetch failed; keeping the fallback numbers from dashboard.json. Retrying...', err);
      retryInitial(fetchWeather, 'Weather fetch');
    });
  }).catch(function (err) {
    console.error('Initial dashboard data load failed; starting with empty data. Retrying...', err);
    retryInitial(function () {
      return load().then(function () {
        return fetchWeather().catch(function (e) {
          console.error('Weather fetch failed during data-load retry; keeping previous numbers.', e);
        });
      });
    }, 'Dashboard data load');
  });

  // Periodic refresh: re-fetch, re-apply onto the SAME window.DATA object, then tell the app to
  // re-render (App.emit('data') -- app.js's markStale() listens for this and marks every
  // non-current view dirty so it rebuilds next time it's shown; the current view is explicitly
  // rerendered by App.rerender() right after). load() then fetchWeather(), in that order and not
  // in parallel, for the same reason as above.
  setInterval(function () {
    load()
      .then(function () { return fetchWeather().catch(function (err) { console.error('Weather refresh failed; keeping previous numbers.', err); }); })
      .then(function () {
        if (window.App) {
          window.App.emit('data');
          window.App.rerender();
        }
      })
      .catch(function (err) {
        console.error('Dashboard data refresh failed; keeping previous data.', err);
      });
  }, REFRESH_MS);
})();
