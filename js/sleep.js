// Scheduled sleep: shows a full-black overlay outside the configured "awake" windows, rather than
// a true hardware display sleep. The frame's touchscreen doesn't wake from a real sleep (confirmed
// on-device), so "asleep" has to be something a tap can still dismiss -- a live page under solid
// black, not a powered-down panel. Manual trigger is a long-press on the rail clock (upstream had
// this wired for "demo controls" that aren't loaded in this build; repurposed here instead).
(function () {
  'use strict';

  // [fromHour, fromMin, toHour, toMin] pairs -- the hours the dashboard should actually be lit.
  var WEEKDAY = [[6, 30, 9, 0], [16, 0, 21, 0]]; // Mon-Fri
  var WEEKEND = [[9, 0, 11, 0], [15, 0, 20, 0]]; // Sat/Sun
  var GRACE_MS = 10 * 60000; // how long a manual wake stays lit outside the schedule

  var el, snoozeUntil = 0;

  function inWindow(mins, w) { return mins >= w[0] * 60 + w[1] && mins < w[2] * 60 + w[3]; }
  function isAwakeNow(d) {
    var day = d.getDay(), mins = d.getHours() * 60 + d.getMinutes();
    var windows = (day === 0 || day === 6) ? WEEKEND : WEEKDAY;
    for (var i = 0; i < windows.length; i++) if (inWindow(mins, windows[i])) return true;
    return false;
  }

  function update() {
    var awake = isAwakeNow(App.now()) || Date.now() < snoozeUntil;
    el.classList.toggle('is-open', !awake);
  }

  // Tapping the overlay wakes it and keeps it lit for a grace period, even outside the schedule,
  // rather than instantly going back dark the moment the next minute tick re-checks the schedule.
  function wake() {
    snoozeUntil = Date.now() + GRACE_MS;
    update();
  }

  // Manual override (long-press the clock): sleep right now regardless of schedule.
  App.sleepNow = function () {
    snoozeUntil = 0;
    el.classList.add('is-open');
  };

  // Bind immediately rather than waiting for 'ready': #sleepOverlay is static markup, already in
  // the DOM by the time this module runs, and App.start()'s very first tick() emits 'minute'
  // (calling update()) BEFORE it emits 'ready' -- so waiting for 'ready' left `el` undefined when
  // update() ran, threw, and aborted the rest of App.start() (killing the clock tick/interval and
  // the 'ready' emit itself). That's why the overlay never armed and the frame stayed lit forever.
  el = App.$('#sleepOverlay');
  el.addEventListener('pointerdown', wake);
  App.hold(App.$('#railClock'), 900, { done: App.sleepNow });
  update();
  App.on('minute', update);
})();
