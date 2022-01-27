// Search placeholder page for market, shows search input only;
// it doesn't return any results to prevent heavy load from bots
//

'use strict';


// Available sort types, first one is the default
//
const SORT_TYPES = [ 'date_desc', 'date_asc', 'price_asc', 'price_desc', 'rel' ];


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    $query: {
      type: 'object',
      required: false,
      properties: {
        query:              { type: 'string' },
        section:            { format: 'mongo' },
        is_new:             { type: 'string' },
        barter:             { type: 'string' },
        delivery:           { type: 'string' },
        search_all:         { type: 'string' },
        price_min_value:    { anyOf: [ { format: 'pos_int_str' }, { const: '' } ] },
        price_min_currency: { type: 'string' },
        price_max_value:    { anyOf: [ { format: 'pos_int_str' }, { const: '' } ] },
        price_max_currency: { type: 'string' },
        range:              { anyOf: [ { format: 'pos_int_str' }, { const: '' } ] },
        sort:               { type: 'string' }
      },
      additionalProperties: true
    }
  });


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let params = env.params.$query || {};

    if (!params.section) return;

    let section = await N.models.market.Section.findById(params.section).lean(true);

    if (section) {
      let type_allowed = await N.models.market.Section.checkIfAllowed(section._id, 'offers');

      if (type_allowed) env.data.section = section;
    }
  });


  // Fetch current user
  //
  N.wire.before(apiPath, async function fetch_user(env) {
    env.data.user = await N.models.users.User.findOne({ _id: env.user_info.user_id });
  });


  // Normalize search params
  //
  N.wire.before(apiPath, async function normalize_params(env) {
    let params = env.params.$query || {};

    env.data.search = {};
    env.data.search.query = params.query || '';

    if (params.is_new)     env.data.search.is_new = true;
    if (params.barter)     env.data.search.barter = true;
    if (params.delivery)   env.data.search.delivery = true;
    if (params.search_all) env.data.search.search_all = true;

    if (Number(params.price_min_value) > 0) {
      env.data.search.price_min_value = Number(params.price_min_value);
    }

    if (Number(params.price_max_value) > 0) {
      env.data.search.price_max_value = Number(params.price_max_value);
    }

    if (N.config.market.currencies.hasOwnProperty(params.price_min_currency)) {
      env.data.search.price_min_currency = params.price_min_currency;
    }

    if (N.config.market.currencies.hasOwnProperty(params.price_max_currency)) {
      env.data.search.price_max_currency = params.price_max_currency;
    }

    if (Number(params.range) > 0 && env.data.user.location) {
      // get nearest available range
      env.data.search.range = Number(params.range) >= 150 ? 200 : 100;
    }

    if (env.data.section) env.data.search.section = env.data.section._id;

    env.res.search = env.data.search;
    env.res.sort_types = SORT_TYPES;

    env.data.search.sort = SORT_TYPES.indexOf(params.sort) ? params.sort : SORT_TYPES[0];
  });


  // Fill head meta
  //
  N.wire.on(apiPath, async function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
    env.res.head.robots = 'noindex,nofollow';

    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    env.res.pagination = {
      total:        0,
      per_page:     env.data.items_per_page,
      chunk_offset: 0
    };
  });


  // Fetch user drafts
  //
  N.wire.after(apiPath, async function fetch_drafts(env) {
    let can_create_items = await env.extras.settings.fetch('market_can_create_items');

    if (can_create_items) {
      env.res.drafts = await N.models.market.Draft.find()
                                 .where('user').equals(env.user_info.user_id)
                                 .sort('-ts')
                                 .lean(true);
    }
  });


  // Fill info needed to render search box
  //
  N.wire.after(apiPath, async function fill_search_options(env) {
    if (env.user_info.is_member) {
      let user = await N.models.users.User.findOne({ _id: env.user_info.user_id });

      if (user) env.res.location_available = !!user.location;
    }

    let c = N.config.market.currencies || {};

    env.res.currency_types = Object.keys(c)
                               .sort((a, b) => (c[a]?.priority ?? 100) - (c[b]?.priority ?? 100));
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    await N.wire.emit('internal:market.breadcrumbs_fill', { env });
  });


  // Fetch settings needed on the client-side
  //
  N.wire.after(apiPath, async function fetch_settings(env) {
    let settings = await env.extras.settings.fetch([
      'market_can_create_items',
      'market_displayed_currency'
    ]);

    if (!env.user_info.is_member) {
      // patch for guests who don't have user store
      let currency = env.extras.getCookie('currency');

      if (currency && N.config.market.currencies.hasOwnProperty(currency)) {
        settings.market_displayed_currency = currency;
      }
    }

    env.res.settings = { ...env.res.settings, ...settings };
  });
};
