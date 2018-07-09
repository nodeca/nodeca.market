// Create a new offer
//

'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Fetch section tree
  //
  N.wire.on(apiPath, async function fetch_sections(env) {
    let section_info = (await N.models.market.Section.getChildren()).filter(s => !s.is_linked);

    let _ids = section_info.map(s => s._id);

    let sections = await N.models.market.Section.find()
                             .where('_id').in(_ids)
                             .lean(true);

    let sections_by_id = _.keyBy(sections, '_id');

    // sort result in the same order as ids
    env.data.sections = section_info.map(info =>
      Object.assign({}, sections_by_id[info._id], { level: info.level })
    );

    env.res.sections = await sanitize_section(N, env.data.sections, env.user_info);
  });


  // Fill parse options for description editor
  //
  N.wire.after(apiPath, async function fill_parse_options(env) {
    env.res.parse_options = await N.settings.getByCategory(
      'market_items_markup',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true }
    );
  });


  // Fill available currencies
  //
  N.wire.after(apiPath, async function fill_options(env) {
    // TODO: move to config
    env.res.currency_types = [ 'RUB', 'USD', 'EUR' ].map(id => ({
      title: env.t('currency_' + id.toLowerCase()),
      value: id
    }));
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
