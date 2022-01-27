// Main market page (list of all categories)
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Fill sections via subcall
  //
  N.wire.on(apiPath, function subsections_fill_subcall(env) {
    env.data.section_item_type = 'offers';
    return N.wire.emit('internal:market.subsections_fill', env);
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


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    await N.wire.emit('internal:market.breadcrumbs_fill', { env });
  });


  // Fetch settings needed on the client-side
  //
  N.wire.after(apiPath, async function fetch_settings(env) {
    env.res.settings = Object.assign({}, env.res.settings, await env.extras.settings.fetch([
      'market_can_create_items',
      'market_displayed_currency'
    ]));

    if (!env.user_info.is_member) {
      // patch for guests who don't have user store
      let currency = env.extras.getCookie('currency');

      if (currency && N.config.market.currencies.hasOwnProperty(currency)) {
        env.res.settings.market_displayed_currency = currency;
      }
    }
  });
};
