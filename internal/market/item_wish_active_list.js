// Get item list with all data needed to render
//
// in:
//
// - env.data.build_item_ids (env, callback) - should fill `env.data.item_ids` with correct sorting order
//
// out:
//
//   env:
//     res:
//       settings: ...
//       items: ...         # array, sanitized, with restricted fields
//     data:
//       items_visible_statuses: ...
//       settings: ...
//
'use strict';


const _                  = require('lodash');
const sanitize_item_wish = require('nodeca.market/lib/sanitizers/item_wish');
const sanitize_section   = require('nodeca.market/lib/sanitizers/section');

let setting_names = [
  'can_see_hellbanned',
  'market_can_create_items',
  'market_displayed_currency',
  'market_items_per_page',
  'market_mod_can_delete_items',
  'market_mod_can_hard_delete_items',
  'market_mod_can_move_items'
];


module.exports = function (N, apiPath) {

  // Fetch and fill permissions
  //
  N.wire.before(apiPath, async function fetch_and_fill_permissions(env) {
    let settings = await env.extras.settings.fetch(setting_names);

    if (!env.user_info.is_member) {
      // patch for guests who don't have user store
      let currency = env.extras.getCookie('currency');

      if (currency && N.config.market.currencies.hasOwnProperty(currency)) {
        settings.market_displayed_currency = currency;
      }
    }

    env.res.settings = env.data.settings = { ...env.data.settings, ...settings };
  });


  // Define visible item statuses,
  // active collection can have only OPEN and HB statuses
  //
  N.wire.before(apiPath, function define_visible_statuses(env) {
    let statuses = N.models.market.ItemWish.statuses;

    env.data.items_visible_statuses = [ statuses.OPEN ];

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      env.data.items_visible_statuses.push(statuses.HB);
    }
  });


  // Get item ids
  //
  N.wire.before(apiPath, async function get_item_ids(env) {
    await env.data.build_item_ids(env);
  });


  // Fetch and sort items
  //
  N.wire.on(apiPath, async function fetch_and_sort_items(env) {
    let items = await N.models.market.ItemWish.find()
                          .where('_id').in(env.data.item_ids)
                          .where('st').in(env.data.items_visible_statuses)
                          .lean(true);

    env.data.items = [];

    // Sort in `env.data.item_ids` order.
    // May be slow on large item volumes
    env.data.item_ids.forEach(id => {
      let item = items.find(t => t._id.equals(id));

      if (item) {
        env.data.items.push(item);
      }
    });
  });


  // Fetch sections where items are located in
  //
  N.wire.after(apiPath, async function fetch_sections(env) {
    let sections = await N.models.market.Section.find()
                             .where('_id').in(_.uniq(env.data.items.map(x => x.section).map(String)))
                             .lean(true);

    env.res.sections_by_id = env.res.sections_by_id || {};
    Object.assign(env.res.sections_by_id, _.keyBy(await sanitize_section(N, sections, env.user_info), '_id'));
  });


  // Fetch and fill bookmarks
  //
  N.wire.after(apiPath, async function fetch_and_fill_bookmarks(env) {
    let bookmarks = await N.models.users.Bookmark.find()
                              .where('user').equals(env.user_info.user_id)
                              .where('src').in(env.data.item_ids)
                              .lean(true);

    if (!bookmarks.length) return;

    env.res.own_bookmarks = bookmarks.map(x => x.src);
  });


  // Collect users
  //
  N.wire.after(apiPath, function collect_users(env) {
    env.data.users = env.data.users || [];

    env.data.items.forEach(function (item) {
      if (item.user)   env.data.users.push(item.user);
      if (item.del_by) env.data.users.push(item.del_by);
    });
  });


  // Fetch locations
  //
  N.wire.after(apiPath, async function fetch_locations(env) {
    let locations = env.data.items.map(i => i.location).filter(Boolean);

    let resolved = locations.length ?
                   await N.models.core.Location.info(locations, env.user_info.locale) :
                   [];

    env.res.location_names = env.res.location_names || {};

    for (let i = 0; i < locations.length; i++) {
      env.res.location_names[locations[i][0] + ':' + locations[i][1]] = resolved[i];
    }
  });


  // Sanitize and fill items
  //
  N.wire.after(apiPath, async function items_sanitize_and_fill(env) {
    env.res.items = await sanitize_item_wish(N, env.data.items, env.user_info);
  });
};
