// Meals: recipes emailed in to moosemagnoliabrown+recipe@gmail.com (a scheduled task parses
// them, strips the fluff, and appends to D.recipes) and a Mon-Sun this-week meal plan. Tapping a
// recipe's ingredients adds that one ingredient to the Shopping list -- no bulk "add all" button,
// by design, so you only grab what you don't already have.
//
// Two tabs, like a .seg toggle: "This week" (a 7-day bar + the day's planned recipe) and
// "Recipes" (a scrollable list you assign onto a day). The week is always THIS calendar week
// (Mon start), so it rolls over on its own -- no manual reset needed.
//
// D.meal_plan is date-keyed ("YYYY-MM-DD" -> an ARRAY of items, since a day can hold more than
// one thing -- "chicken, potatoes, salad, zucchini" is four items on one day, not one). Same idea
// as the chores day-grid, and for the same reason: dashboard.json is re-fetched every 5 minutes,
// which would otherwise wipe out a plan you just set. Assignments made from the UI are layered on
// top via window.MealPlan (localStorage), exactly like ChoreProgress does for chore checkmarks.
(function () {
  'use strict';
  // expanded: which assigned recipes (keyed "dayKey:idx", matching data-remove-item) are shown in
  // full on the "This week" pane -- collapsed (just title + a one-line summary) by default so a
  // day with several things planned stays scannable instead of a wall of ingredients/steps.
  var D = window.DATA, V = {
    el: null, tab: 'week', day: null, assignTarget: null, expanded: {},
    // Recipes-tab filtering: course/mealType/cuisine are chip facets (OR within a facet, AND
    // across facets); q is a free-text search over title/mainIngredients/ingredients, applied
    // directly to rendered cards (see applySearchVisibility) rather than through paint(), so
    // typing doesn't steal focus by re-rendering the input on every keystroke.
    filters: { course: [], mealType: [], cuisine: [] }, q: ''
  };
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DOW_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var FACETS = {
    course: ['main', 'side', 'appetizer', 'dessert', 'snack', 'drink'],
    mealType: ['breakfast', 'lunch', 'dinner', 'snack'],
    cuisine: ['American', 'Mexican', 'Italian', 'Indian', 'Asian', 'Mediterranean', 'Other']
  };

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dkey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  // Monday-of-this-week at local midnight.
  function startOfWeek() {
    var n = App.now();
    var d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function dateForDay(i) { var d = new Date(startOfWeek()); d.setDate(d.getDate() + i); return d; }
  function todayIdx() { return (App.now().getDay() + 6) % 7; }
  function selectedDay() { return V.day == null ? todayIdx() : V.day; }
  function recipeById(id) { return D.recipes.filter(function (r) { return r.id === id; })[0]; }

  // ------------------------------------------------------------ shopping-list hookup
  // Deliberately minimal: strip a leading quantity/unit off the ingredient line so "2 cups rice"
  // becomes "Rice" on the list, then dedupe against what's already there the same way Shopping's
  // own quick-add does. Not perfect for every phrasing -- the person can always edit/remove it on
  // the Shopping page same as anything else they add.
  var UNIT_RE = /^(cups?|tbsp\.?|tablespoons?|tsp\.?|teaspoons?|lbs?\.?|pounds?|oz\.?|ounces?|cloves?|cans?|g|kg|ml|l|liters?|pinch(?:es)?|slices?|stalks?|bunch(?:es)?|packages?|boxes?)\b\.?\s*(of\s+)?/i;
  function cleanIngredientName(raw) {
    var s = raw.replace(/^[\s\d½¼¾⅓⅔⅛⅜⅝⅞./–-]+/, '').replace(UNIT_RE, '').trim();
    if (!s) s = raw.trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function addIngredientToShopping(raw) {
    var name = cleanIngredientName(raw);
    var existing = D.groceries.filter(function (g) { return !g.done && g.name.toLowerCase() === name.toLowerCase(); })[0];
    if (existing) { existing.qty++; }
    else {
      var cat = D.catalog.filter(function (c) { return c[0].toLowerCase() === name.toLowerCase(); })[0];
      D.groceries.push({
        id: D._gid(), name: cat ? cat[0] : name, cat: cat ? cat[1] : 'Other',
        qty: 1, store: (cat && cat[2]) || (D.stores[0] && D.stores[0].id) || null, done: false, note: ''
      });
    }
    window.GroceryList.save();
    App.emit('data');
    App.toast('Added <b>' + App.esc(name) + '</b> to Shopping', { icon: 'cart', ms: 2200 });
  }

  // A day's list holds items that are either a recipe id (looked up in D.recipes) or, for a
  // quick/manual entry like "Spaghetti" that doesn't need a recipe, the plain typed name itself
  // -- recipeById() simply won't find a match for that string, and that's how the two are told
  // apart (no separate flag needed).
  // Defensive against a leftover single-value entry from before a day's plan became a list (an
  // old localStorage/dashboard.json write, or any other way a bare string/id ends up here) --
  // normalize it into a one-item list instead of calling .map() on a plain string and crashing.
  function dayItems(key) {
    var v = D.meal_plan[key];
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }
  function saveDayItems(key, list) {
    if (list && list.length) D.meal_plan[key] = list; else delete D.meal_plan[key];
    window.MealPlan.set(key, list && list.length ? list : null);
    App.emit('data');
  }
  function addMealItem(key, value) {
    var list = dayItems(key).slice();
    list.push(value);
    saveDayItems(key, list);
  }
  function removeMealItem(key, idx) {
    var list = dayItems(key).slice();
    list.splice(idx, 1);
    saveDayItems(key, list);
  }
  // Toggling a recipe onto/off a day from its own sheet (as opposed to adding a fresh item every
  // tap) -- returns whether it ended up added, so the caller can toast/style accordingly.
  function toggleMealItem(key, value) {
    var list = dayItems(key).slice();
    var idx = list.indexOf(value);
    if (idx > -1) list.splice(idx, 1); else list.push(value);
    saveDayItems(key, list);
    return idx === -1;
  }

  // ------------------------------------------------------------ shared recipe markup
  function ingredientsHTML(r) {
    return '<ul class="mr-ing">' + r.ingredients.map(function (ing, i) {
      return '<li><button class="mr-add" data-add-ing="' + r.id + ':' + i + '" aria-label="Add to shopping list">' + App.icon('plus', 18) + '</button><span>' + App.esc(ing) + '</span></li>';
    }).join('') + '</ul>';
  }
  function instructionsHTML(r) {
    if (!r.instructions || !r.instructions.length) return '';
    return '<div class="label">Instructions</div><ol class="mr-steps">' + r.instructions.map(function (s) {
      return '<li>' + App.esc(s) + '</li>';
    }).join('') + '</ol>';
  }
  function recipeMetaHTML(r) {
    return (r.servings ? 'Serves ' + r.servings : 'Recipe') + (r.from ? ' · from ' + App.esc(r.from) : '');
  }

  // ------------------------------------------------------------ "This week" tab
  function weekbarHTML() {
    return [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var d = dateForDay(i), key = dkey(d), n = dayItems(key).length;
      return '<button class="mw-day' + (i === todayIdx() ? ' is-today' : '') + (i === selectedDay() ? ' is-sel' : '') + '" data-day="' + i + '">' +
        '<span class="mw-dow">' + DOW[i] + '</span><span class="mw-date num">' + d.getDate() + '</span>' +
        (n ? '<i class="mw-dot"></i>' : '') + '</button>';
    }).join('');
  }
  function mealItemHTML(key, value, idx) {
    var r = recipeById(value);
    var x = '<button class="mw-item-x" data-remove-item="' + key + ':' + idx + '" aria-label="Remove">' + App.icon('x', 20) + '</button>';
    if (!r) {
      return '<div class="mw-item"><div class="mw-item-head"><h3 class="serif mw-item-title">' + App.esc(value) + '</h3>' + x + '</div>' +
        '<div class="label">Added manually</div></div>';
    }
    var ek = key + ':' + idx, open = !!V.expanded[ek];
    var toggle = '<button class="mw-item-toggle' + (open ? ' is-open' : '') + '" data-toggle-item="' + ek + '" aria-label="' +
      (open ? 'Collapse recipe' : 'Expand recipe') + '" aria-expanded="' + open + '">' + App.icon('chevron', 22) + '</button>';
    return '<div class="mw-item"><div class="mw-item-head"><h3 class="serif mw-item-title">' + App.esc(r.title) + '</h3>' + toggle + x + '</div>' +
      '<div class="label">' + recipeMetaHTML(r) + ' · ' + r.ingredients.length + ' ingredient' + (r.ingredients.length === 1 ? '' : 's') + '</div>' +
      (open ? '<div class="label">Ingredients</div>' + ingredientsHTML(r) + instructionsHTML(r) : '') +
      '</div>';
  }
  function dayPaneHTML(i) {
    var d = dateForDay(i), key = dkey(d), list = dayItems(key);
    var head = '<div class="label">' + DOW_FULL[i] + ' · ' + App.fmt.month(d) + ' ' + d.getDate() + '</div>';
    if (!list.length) {
      return head + '<div class="mw-empty-wrap">' +
        '<div class="mw-empty serif">Nothing planned yet.</div>' +
        '<div class="mw-empty-actions"><button class="btn btn--solid" data-quick-sheet="' + key + '">+ Add a meal</button>' +
        '<button class="btn btn--ghost" data-choose="' + key + '">Choose a recipe</button></div>' +
        '</div>';
    }
    return head + list.map(function (v, idx) { return mealItemHTML(key, v, idx); }).join('') +
      '<div class="mw-add-more"><button class="btn btn--ghost" data-quick-sheet="' + key + '">+ Add another</button>' +
      '<button class="btn btn--ghost" data-choose="' + key + '">+ From recipes</button></div>';
  }

  // ------------------------------------------------------------ "Recipes" tab
  function assignTargetLabel() {
    for (var i = 0; i < 7; i++) { if (dkey(dateForDay(i)) === V.assignTarget) return DOW_FULL[i]; }
    return '';
  }

  // ---- filtering: fixed chip facets (course/mealType/cuisine) + free-text search over
  // title/mainIngredients/ingredients. Chips are OR within a facet, AND across facets -- e.g.
  // ticking "Dinner" + "Mexican" shows anything that's dinner-suitable AND Mexican, but ticking
  // both "Main" and "Side" under Course shows either.
  function toggleFilter(facet, val) {
    var list = V.filters[facet], i = list.indexOf(val);
    if (i > -1) list.splice(i, 1); else list.push(val);
  }
  function filtersActive() {
    return V.filters.course.length || V.filters.mealType.length || V.filters.cuisine.length || V.q.trim();
  }
  function recipeMatchesChips(r) {
    function any(sel, have) { return !sel.length || sel.some(function (v) { return (have || []).indexOf(v) > -1; }); }
    return any(V.filters.course, r.course) && any(V.filters.mealType, r.mealType) &&
      (!V.filters.cuisine.length || V.filters.cuisine.indexOf(r.cuisine) > -1);
  }
  function searchBlob(r) {
    return [r.title, (r.mainIngredients || []).join(' '), (r.ingredients || []).join(' ')].join(' ').toLowerCase();
  }
  // Toggles .is-hidden on already-rendered cards instead of re-painting, so typing in the search
  // box never steals its own focus. Called once right after any paint() too, so chip clicks (which
  // DO re-render) still honor whatever's currently typed.
  function applySearchVisibility() {
    var q = V.q.trim().toLowerCase();
    Array.prototype.forEach.call(V.el.querySelectorAll('.mr-card'), function (card) {
      card.classList.toggle('is-hidden', !(!q || (card.getAttribute('data-search') || '').indexOf(q) > -1));
    });
  }
  function filterChipsHTML() {
    function row(label, facet, values) {
      return '<div class="mr-filter-row"><span class="label">' + label + '</span><div class="chips">' +
        values.map(function (v) {
          var on = V.filters[facet].indexOf(v) > -1;
          return '<button class="chip chip--ghost' + (on ? ' is-on' : '') + '" data-facet="' + facet + '" data-val="' + v + '">' +
            v.charAt(0).toUpperCase() + v.slice(1) + '</button>';
        }).join('') + '</div></div>';
    }
    return '<div class="mr-filters">' +
      '<input class="mr-search" type="text" inputmode="search" placeholder="Search by name or ingredient…" value="' + App.esc(V.q) + '">' +
      row('Course', 'course', FACETS.course) +
      row('Meal', 'mealType', FACETS.mealType) +
      row('Cuisine', 'cuisine', FACETS.cuisine) +
      (filtersActive() ? '<button class="btn btn--ghost mr-clear" data-clear-filters>Clear filters</button>' : '') +
      '</div>';
  }

  function recipesTabHTML() {
    var banner = V.assignTarget
      ? '<div class="mw-assignbar"><span>Choose a recipe for <b>' + assignTargetLabel() + '</b></span><button class="btn btn--ghost" data-cancel-assign>Cancel</button></div>'
      : '';
    if (!D.recipes.length) {
      return banner + '<div class="mw-empty serif">No recipes yet.<br><i>Email one to moosemagnoliabrown+recipe@gmail.com</i><br>and it’ll show up here.</div>';
    }
    var matches = D.recipes.filter(recipeMatchesChips);
    var body = matches.length
      ? '<div class="mr-grid">' + matches.slice().reverse().map(function (r) {
        return '<button class="mr-card" data-recipe="' + r.id + '" data-search="' + App.esc(searchBlob(r)) + '">' +
          '<div class="label">' + (r.servings ? 'Serves ' + r.servings : 'Recipe') + '</div>' +
          '<div class="mr-card-title serif">' + App.esc(r.title) + '</div>' +
          '<div class="mr-card-meta">' + r.ingredients.length + ' ingredients' + (r.from ? ' · from ' + App.esc(r.from) : '') + '</div>' +
          '</button>';
      }).join('') + '</div>'
      : '<div class="mw-empty serif">No recipes match these filters.</div>';
    return banner + filterChipsHTML() + body;
  }

  function openRecipeSheet(r) {
    App.sheet(
      '<div class="sheet-pad mr-sheet">' +
      '<div class="label">' + (r.servings ? 'Serves ' + r.servings : 'Recipe') + (r.from ? ' · from ' + App.esc(r.from) : '') + '</div>' +
      '<h2 class="serif sheet-h">' + App.esc(r.title) + '</h2>' +
      '<div class="label">Ingredients</div>' + ingredientsHTML(r) +
      instructionsHTML(r) +
      '<div class="label">Add to a day</div>' +
      '<div class="chips mr-days">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) {
        var d = dateForDay(i), key = dkey(d), on = dayItems(key).indexOf(r.id) > -1;
        return '<button class="chip' + (on ? ' is-on' : '') + '" data-assign-day="' + key + '" data-assign-recipe="' + r.id + '">' + DOW[i] + ' ' + d.getDate() + '</button>';
      }).join('') + '</div>' +
      '</div>',
      {
        cls: 'sheet--wide',
        onMount: function (s) {
          s.addEventListener('click', function (e) {
            var t;
            if ((t = e.target.closest('[data-add-ing]'))) {
              var parts = t.dataset.addIng.split(':'), rec = recipeById(parts[0]);
              if (rec) addIngredientToShopping(rec.ingredients[+parts[1]]);
              return;
            }
            if ((t = e.target.closest('[data-assign-day]'))) {
              var added = toggleMealItem(t.dataset.assignDay, t.dataset.assignRecipe);
              App.toast(added ? 'Added to the plan' : 'Removed from the plan', { icon: 'utensils', ms: 1800 });
              t.classList.toggle('is-on', added);
              return;
            }
          });
        }
      }
    );
  }

  // ------------------------------------------------------------ paint / events
  function paint() {
    var el = V.el;
    el.querySelector('.meals-seg').innerHTML = '<div class="seg">' +
      '<button data-tab="week" class="' + (V.tab === 'week' ? 'is-on' : '') + '">This week</button>' +
      '<button data-tab="recipes" class="' + (V.tab === 'recipes' ? 'is-on' : '') + '">Recipes<span class="num">' + D.recipes.length + '</span></button>' +
      '</div>';
    el.querySelector('.meals-body').innerHTML = V.tab === 'week'
      ? '<div class="mw-bar">' + weekbarHTML() + '</div><div class="mw-pane">' + dayPaneHTML(selectedDay()) + '</div>'
      : recipesTabHTML();
    if (V.tab === 'recipes') applySearchVisibility();
  }

  // Quick/manual entry: no recipe behind it, just a plain name typed straight into a day --
  // dayPaneHTML() and weekbarHTML() treat it exactly like a recipe id that happens not to
  // resolve, so nothing else needs to know this path exists. Uses the same sheet pattern as
  // Calendar's "Add event" (big serif input + tappable idea chips) rather than a cramped inline
  // text box in the day pane itself.
  var QUICK_IDEAS = ['Spaghetti', 'Tacos', 'Pizza night', 'Breakfast for dinner', 'Leftovers', 'Takeout'];
  function openQuickSheet(key) {
    App.sheet(
      '<div class="sheet-pad add">' +
      '<div class="label">New meal</div>' +
      '<input class="big-input serif" placeholder="What’s for dinner?" data-f="title">' +
      '<div class="chips">' + QUICK_IDEAS.map(function (i) { return '<button class="chip chip--ghost" data-idea="' + i + '">' + i + '</button>'; }).join('') + '</div>' +
      '<div class="sheet-actions"><button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--solid" data-save>Add</button></div>' +
      '</div>',
      {
        onMount: function (s, close) {
          var input = s.querySelector('[data-f="title"]');
          function save() {
            var val = input.value.trim();
            if (!val) { input.focus(); return; }
            addMealItem(key, val);
            App.toast('Added <b>' + App.esc(val) + '</b> to the plan', { icon: 'utensils' });
            close();
            paint();
          }
          s.addEventListener('click', function (e) {
            var t;
            if ((t = e.target.closest('[data-idea]'))) { input.value = t.dataset.idea; input.focus(); return; }
            if (e.target.closest('[data-save]')) save();
          });
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
          input.focus();
        }
      }
    );
  }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-tab]'))) { V.tab = t.dataset.tab; paint(); return; }
    if ((t = e.target.closest('[data-day]'))) { V.day = +t.dataset.day; paint(); return; }
    if ((t = e.target.closest('[data-choose]'))) { V.assignTarget = t.dataset.choose; V.tab = 'recipes'; paint(); return; }
    if ((t = e.target.closest('[data-toggle-item]'))) {
      var ek0 = t.dataset.toggleItem;
      V.expanded[ek0] = !V.expanded[ek0];
      paint();
      return;
    }
    if ((t = e.target.closest('[data-remove-item]'))) {
      var parts0 = t.dataset.removeItem.split(':');
      removeMealItem(parts0[0], +parts0[1]);
      paint();
      return;
    }
    if ((t = e.target.closest('[data-cancel-assign]'))) { V.assignTarget = null; paint(); return; }
    if ((t = e.target.closest('[data-facet]'))) { toggleFilter(t.dataset.facet, t.dataset.val); paint(); return; }
    if ((t = e.target.closest('[data-clear-filters]'))) { V.filters = { course: [], mealType: [], cuisine: [] }; V.q = ''; paint(); return; }
    if ((t = e.target.closest('[data-quick-sheet]'))) { openQuickSheet(t.dataset.quickSheet); return; }
    if ((t = e.target.closest('[data-add-ing]'))) {
      var parts = t.dataset.addIng.split(':'), rec = recipeById(parts[0]);
      if (rec) addIngredientToShopping(rec.ingredients[+parts[1]]);
      return;
    }
    if ((t = e.target.closest('[data-recipe]'))) {
      var r = recipeById(t.dataset.recipe);
      if (!r) return;
      if (V.assignTarget) {
        var targetKey = V.assignTarget;
        addMealItem(targetKey, r.id);
        // Expand the one just added so adding it visibly confirms what landed on the day,
        // instead of it showing up collapsed and looking like nothing happened.
        V.expanded[targetKey + ':' + (dayItems(targetKey).length - 1)] = true;
        App.toast('Added <b>' + App.esc(r.title) + '</b> to the plan', { icon: 'utensils' });
        for (var i = 0; i < 7; i++) { if (dkey(dateForDay(i)) === targetKey) V.day = i; }
        V.assignTarget = null; V.tab = 'week'; paint();
      } else {
        openRecipeSheet(r);
      }
      return;
    }
  }

  App.register('meals', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="meals"><div class="meals-seg"></div><div class="meals-body"></div></div>';
        el.addEventListener('click', onClick);
        // Live search: update visibility directly (no paint()) so the input never loses focus
        // mid-keystroke the way a full re-render would.
        el.addEventListener('input', function (e) {
          if (e.target.classList.contains('mr-search')) {
            V.q = e.target.value;
            applySearchVisibility();
          }
        });
      }
      paint();
    }
  });
  App.on('data', function () { if (App.current === 'meals') paint(); });
})();
