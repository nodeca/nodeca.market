// Get item list with all data needed to render
//
// in:
//
// - env.data.section_hid
// - env.data.offer_type (String) - "buy" or "sell"
// - env.data.build_item_ids (env, callback) - should fill `env.data.item_ids` with correct sorting order
//
// out:
//
//   env:
//     res:
//       settings: ...
//       items: ...         # array, sanitized, with restricted fields
//       section: ...       # with restricted fields
//     data:
//       items_visible_statuses: ...
//       settings: ...
//       section: ...
//
'use strict';


const _                = require('lodash');
const sanitize_item    = require('nodeca.market/lib/sanitizers/item');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let section = await N.models.market.Section.findOne({ hid: env.data.section_hid }).lean(true);

    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;
  });


  // Fetch and fill permissions
  //
  N.wire.before(apiPath, async function fetch_and_fill_permissions(env) {
    env.res.settings = env.data.settings = await env.extras.settings.fetch([
      'can_see_hellbanned',
      'market_items_per_page'
    ]);
  });


  // Define visible item statuses
  //
  N.wire.before(apiPath, function define_visible_statuses(env) {
    let statuses = N.models.market.ItemOffer.statuses;

    env.data.items_visible_statuses = [ statuses.VISIBLE ];

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

    let items = await N.models.market.ItemOffer.find()
                          .where('_id').in(env.data.item_ids)
                          .where('st').in(env.data.items_visible_statuses)
                          .where('section').equals(env.data.section._id)
                          .lean(true);

    env.data.items = [];

    // Sort in `env.data.item_ids` order.
    // May be slow on large item volumes
    env.data.item_ids.forEach(id => {
      let item = _.find(items, t => t._id.equals(id));

      if (item) {
        env.data.items.push(item);
      }
    });
  });


  // Collect users
  //
  N.wire.after(apiPath, function collect_users(env) {
    env.data.users = env.data.users || [];

    env.data.items.forEach(function (item) {
      env.data.users.push(item.user);
    });
  });


  // Check if any users are ignored
  //
  N.wire.after(apiPath, async function check_ignores(env) {
    let users = env.data.items.map(item => item.user).filter(Boolean);

    // don't fetch `_id` to load all data from composite index
    let ignored = await N.models.users.Ignore.find()
                            .where('from').equals(env.user_info.user_id)
                            .where('to').in(users)
                            .select('from to -_id')
                            .lean(true);

    env.res.ignored_users = env.res.ignored_users || {};

    ignored.forEach(row => {
      env.res.ignored_users[row.to] = true;
    });
  });


  // Fetch locations
  //
  N.wire.after(apiPath, async function fetch_locations(env) {
    let locations = env.data.items.map(i => i.location).filter(Boolean);

    let resolved = locations.length ?
                   await N.models.core.Location.info(locations, env.user_info.locale) :
                   [];

    env.res.location_names = {};

    for (let i = 0; i < locations.length; i++) {
      env.res.location_names[locations[i][0] + ':' + locations[i][1]] = resolved[i];
    }
  });


  // Sanitize and fill items
  //
  N.wire.after(apiPath, async function items_sanitize_and_fill(env) {
    env.res.items   = await sanitize_item(N, env.data.items, env.user_info);
    env.res.section = await sanitize_section(N, env.data.section, env.user_info);
  });
};
