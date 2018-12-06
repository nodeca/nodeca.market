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


const _                   = require('lodash');
const sanitize_item_offer = require('nodeca.market/lib/sanitizers/item_offer');
const sanitize_section    = require('nodeca.market/lib/sanitizers/section');

let setting_names = [
  'can_see_hellbanned',
  'market_can_create_items',
  'market_displayed_currency',
  'market_items_per_page',
  'market_mod_can_delete_items',
  'market_mod_can_move_items',
  'market_show_ignored'
];


module.exports = function (N, apiPath) {

  // Fetch and fill permissions
  //
  N.wire.before(apiPath, async function fetch_and_fill_permissions(env) {
    env.data.settings = env.data.settings || {};
    Object.assign(env.data.settings, await env.extras.settings.fetch(setting_names));

    if (env.session.currency) {
      // patch for guests who don't have user store
      env.data.settings.market_displayed_currency = env.session.currency;
    }

    env.res.settings = env.data.settings;
  });


  // Define visible item statuses,
  // active collection can have only OPEN and HB statuses
  //
  N.wire.before(apiPath, function define_visible_statuses(env) {
    let statuses = N.models.market.ItemOffer.statuses;

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
    let items = await N.models.market.ItemOffer.find()
                          .where('_id').in(env.data.item_ids)
                          .where('st').in(env.data.items_visible_statuses)
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


  // Fetch sections where items are located in
  //
  N.wire.after(apiPath, async function fetch_sections(env) {
    let sections = await N.models.market.Section.find()
                             .where('_id').in(_.uniq(_.map(env.data.items, 'section').map(String)))
                             .lean(true);

    env.res.sections_by_id = env.res.sections_by_id || {};
    Object.assign(env.res.sections_by_id, _.keyBy(await sanitize_section(N, sections, env.user_info), '_id'));
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


  // Fetch currency rates
  //
  N.wire.after(apiPath, async function fetch_currency_rates(env) {
    let currencies = _.uniq(env.data.items.map(i => i.price && i.price.currency).filter(Boolean));

    env.res.currency_rates = {};

    for (let c of currencies) {
      env.res.currency_rates[c] = await N.models.market.CurrencyRate.get(
        c, env.data.settings.market_displayed_currency
      );
    }
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
    env.res.items = await sanitize_item_offer(N, env.data.items, env.user_info);
  });
};
