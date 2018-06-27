// Main market page (list of all categories)
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Fetch categories
  //
  N.wire.on(apiPath, function market_categories_fetch(env) {
    // TODO
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
  });


  // Fill breadcrumbs
  //
  N.wire.after(apiPath, function fill_breadcrumbs(env) {
    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.market'),
      route: 'market.index'
    });

    env.res.breadcrumbs = env.data.breadcrumbs;
  });
};
