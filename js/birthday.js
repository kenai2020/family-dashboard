// Birthday takeover: a full-screen, continuously-animated celebration screen shown over
// everything during idle moments on a day someone in the family has a birthday event on the
// calendar. Deliberately idle-only, not an all-day lockout -- the dashboard stays fully usable
// (calendar, chores, shopping, etc.) all day; this just takes over the screen when nobody's
// touching it, and tapping anywhere dismisses it immediately (it'll reopen after the next idle
// stretch). Reuses the existing #takeover layer/overlay mechanism (see css/base.css's
// .takeover / .is-open), which app.js's own idle-to-home logic already treats as "blocked" while
// open, so the two don't fight each other.
(function () {
  'use strict';
  var D = window.DATA;

  // ---------------------------------------------------------------- who's celebrating today
  var bday = null; // { people: [...ids], names: [...names] } or null
  function computeBirthdays() {
    var today = App.dayStart(App.now()), tomorrow = App.addDays(today, 1);
    var ids = [], names = [];
    D.events.forEach(function (e) {
      if (!e.allDay || !/birthday/i.test(e.title)) return;
      if (e.start >= tomorrow || e.end <= today) return; // doesn't cover today
      if (App.isFamily(e)) return; // a whole-family color can't mean "it's everyone's birthday"
      e.people.forEach(function (id) {
        if (ids.indexOf(id) === -1) { ids.push(id); names.push(App.person(id).name); }
      });
    });
    bday = ids.length ? { people: ids, names: names } : null;
  }
  App.on('data', computeBirthdays);
  App.on('minute', function () {
    // Cheap enough to just recompute every minute -- handles both the midnight rollover (into
    // or out of the birthday) and the rare new-sync-mid-day case without extra bookkeeping.
    computeBirthdays();
  });

  // ---------------------------------------------------------------- confetti / balloons (fixed
  // DOM, CSS-driven looping animations only -- no per-frame JS, so this is safe to leave running
  // for a whole day without any memory or CPU growth).
  var CONFETTI_COLORS = ['#FF4D6D', '#FFD23F', '#3DDC97', '#4EA8FF', '#FF8A3D', '#FFFFFF'];
  var BALLOON_COLORS = ['#FF4D6D', '#FFD23F', '#4EA8FF', '#FF8A3D', '#FFFFFF'];
  function rand(min, max) { return min + Math.random() * (max - min); }
  function confettiFx() {
    var out = '';
    for (var i = 0; i < 36; i++) {
      var dur = rand(4.5, 8), delay = -rand(0, dur), left = rand(-2, 102), hue = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      out += '<i class="tk-confetti" style="left:' + left + '%;background:' + hue + ';' +
        'animation-duration:' + dur.toFixed(2) + 's;animation-delay:' + delay.toFixed(2) + 's;' +
        'transform:rotate(' + Math.round(rand(0, 360)) + 'deg)"></i>';
    }
    return out;
  }
  function balloonsFx() {
    var out = '';
    for (var i = 0; i < 10; i++) {
      var dur = rand(16, 26), delay = -rand(0, dur), left = rand(0, 90), hue = BALLOON_COLORS[i % BALLOON_COLORS.length];
      var size = rand(0.8, 1.25);
      out += '<i class="tk-balloon" style="left:' + left + '%;background:' + hue + ';' +
        'width:' + (64 * size).toFixed(0) + 'px;height:' + (78 * size).toFixed(0) + 'px;' +
        'animation-duration:' + dur.toFixed(2) + 's;animation-delay:' + delay.toFixed(2) + 's"></i>';
    }
    return out;
  }

  // ---------------------------------------------------------------- the takeover itself
  var layer, isOpen = false;
  function render() {
    var solo = bday.people.length === 1, p = solo ? App.person(bday.people[0]) : D.family;
    var names = bday.names.length > 1 ? bday.names.slice(0, -1).join(', ') + ' & ' + bday.names.slice(-1) : bday.names[0];
    layer.setAttribute('style', App.pstyle(p));
    layer.innerHTML =
      '<div class="tk-bday-fx">' + confettiFx() + balloonsFx() + '</div>' +
      '<div class="tk-bday-msg">' +
      '<div class="tk-bday-emoji">🎉🎂🎉</div>' +
      '<h1 class="tk-bday-title serif">Happy Birthday' + (names ? ',<br>' + App.esc(names) : '') + '!</h1>' +
      '</div>';
  }
  function open() {
    if (isOpen || !bday) return;
    isOpen = true;
    render();
    layer.className = 'takeover takeover--birthday is-open';
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    layer.className = 'takeover';
    layer.innerHTML = '';
    layer.removeAttribute('style');
  }

  // ---------------------------------------------------------------- idle detection
  // Deliberately independent of app.js's own idle/mode system (which drives the separate,
  // currently-unused ambient/night screensaver) -- this is simpler to keep decoupled than to
  // resurrect that half-wired mechanism just for this.
  var IDLE_SECONDS = 45;
  var idleSec = 0;
  App.on('second', function () {
    if (isOpen) return; // don't keep counting once it's already showing
    idleSec++;
    if (idleSec >= IDLE_SECONDS && bday && !document.querySelector('.sheet-layer.is-open')) open();
  });
  document.addEventListener('pointerdown', function () { idleSec = 0; }, true);

  function boot() {
    layer = document.getElementById('takeover');
    layer.addEventListener('click', function () { idleSec = 0; close(); });
    computeBirthdays();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
