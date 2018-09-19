// Search in market
//

'use strict';


const sanitize_section = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    $query: {
      type: 'object',
      required: false,
      properties: {
        query:              { type: 'string' },
        section:            { format: 'mongo' },
        search_all:         { type: 'string' },
        range:              { type: 'string' }
      },
      additionalProperties: true
    }
  });


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    if (!env.params.$query || !env.params.$query.section) return;

    env.data.section = await N.models.market.Section.findById(env.params.$query.section)
                                 .lean(true);

    if (!env.data.section) return;

    env.res.section = await sanitize_section(N, env.data.section, env.user_info);
  });


  // Normalize search params
  //
  N.wire.before(apiPath, async function normalize_params(env) {
    let $query = env.params.$query;

    env.data.search = {};

    if ($query.query)      env.data.search.query = $query.query;
    if ($query.search_all) env.data.search.search_all = true;

    if (Number($query.range) > 0) {
      env.data.search.range = Number($query.range) >= 150 ? 200 : 100;
    }

    if (env.data.section) env.data.search.section = env.data.section._id;

    env.res.search = env.data.search;
  });


  N.wire.on(apiPath, async function todo() {
    // TODO
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
    let user = await N.models.users.User.findOne({ _id: env.user_info.user_id });

    env.res.location_available = !!user.location;

    let c = N.config.market.currencies || {};

    env.res.currency_types = Object.keys(c)
                               .sort((a, b) => ((c[a] || {}).priority || 100) - ((c[b] || {}).priority || 100));
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    await N.wire.emit('internal:market.breadcrumbs_fill', { env, wish: true });
  });


  // Fetch settings needed on the client-side
  //
  N.wire.after(apiPath, async function fetch_settings(env) {
    // TODO: remove this, duplicate
    env.res.settings = Object.assign({}, env.res.settings, await env.extras.settings.fetch([
      'market_can_create_items',
      'market_displayed_currency'
    ]));

    if (env.session.currency) {
      // patch for guests who don't have user store
      env.res.settings.market_displayed_currency = env.session.currency;
    }
  });
};