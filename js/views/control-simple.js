// Simplified "Home" view. Upstream's control.js is a full interactive smart-home panel (lights,
// locks, blinds, garage, media player, cameras, scenes) backed entirely by fake demo devices. We
// don't have real smart-home integration here, so rather than ship fake toggles that don't
// control anything real, this just shows the same read-only status fields as the Today page's
// status card, at a larger size. Swap this out for the real control.js (restored from upstream)
// if/when real smart-home devices get wired in.
(function () {
  'use strict';
  var D = window.DATA, V = {};

  function tile(label, value, sub) {
    return '<div class="home-tile card"><div class="label">' + label + '</div>' +
      '<div class="home-tile-value">' + value + '</div>' +
      (sub ? '<div class="home-tile-sub">' + sub + '</div>' : '') + '</div>';
  }

  function paint() {
    var s = D.home_status || { lights_on: 0, all_locked: true, inside_temp_f: null };
    V.el.querySelector('.home-grid').innerHTML =
      tile('Lights', s.lights_on, s.lights_on === 1 ? 'light on' : 'lights on') +
      tile('Locks', s.all_locked ? 'Locked' : 'Unlocked', s.all_locked ? "Everything's secure" : 'Check the doors') +
      (s.inside_temp_f != null ? tile('Temperature', s.inside_temp_f + '°', 'inside') : '');
  }

  App.register('control', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="page-head"><h1 class="serif">Home</h1><div class="label">Status</div></div>' +
          '<div class="home-grid"></div>';
      }
      paint();
    },
    resume: function () {},
    hide: function () {}
  });

  App.on('data', function () { if (App.current === 'control') paint(); });
})();
