// Market section
//

'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true }
  });


  // Fetch section
  //
  N.wire.on(apiPath, async function fetch_section(env) {
    let section = await N.models.market.Section.findOne()
                            .where('hid').equals(env.params.section_hid)
                            .lean(true);

    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_breadcrumbs(env) {
    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.market'),
      route: 'market.index'
    });

    env.res.breadcrumbs = env.data.breadcrumbs;
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.data.section.title;
  });


  // Sanitize section
  //
  N.wire.after(apiPath, async function section_sanitize(env) {
    env.res.section = await sanitize_section(N, env.data.section, env.user_info);
  });
};
