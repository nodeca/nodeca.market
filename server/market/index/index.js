// Main market page (list of all categories)
//

'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Fill sections via subcall
  //
  N.wire.on(apiPath, function subsections_fill_subcall(env) {
    return N.wire.emit('internal:market.subsections_fill', env);
  });


  // Fetch user drafts
  //
  N.wire.after(apiPath, async function fetch_drafts(env) {
    env.res.drafts = await N.models.market.Draft.find()
                               .where('user').equals(env.user_info.user_id)
                               .sort('-ts')
                               .lean(true);
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
