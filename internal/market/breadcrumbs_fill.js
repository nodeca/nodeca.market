// Fill breadcrumbs data in response for market pages
//
'use strict';


const _       = require('lodash');
const memoize = require('promise-memoize');


module.exports = function (N, apiPath) {

  // Helper - cacheable bredcrumbs info fetch, to save DB request.
  // We can cache it, because cache size is limited by sections count.
  let fetchSectionsInfo = memoize(
    ids => N.models.market.Section
      .find({ _id: { $in: ids } })
      .select('hid title')
      .lean(true)
      .exec()
      .then(parents => {
        let result = [];

        // sort result in the same order as ids
        _.forEach(ids, id => {
          result.push(_.find(parents, p => p._id.equals(id)));
        });

        return result;
      }),
    { maxAge: 60000 }
  );

  // data = { env, parents }
  // parents - array of section ids to show in breadcrumbs
  N.wire.on(apiPath, async function internal_breadcrumbs_fill(data) {
    let env     = data.env;
    let parents = data.parents;

    // first element - always link to market root
    env.res.breadcrumbs = [ {
      text: env.t('@common.menus.navbar.market'),
      route: 'market.index.buy'
    } ];

    if (data.wish) {
      // first element - always link to market root
      env.res.breadcrumbs.push({
        text: env.t('@market.breadcrumbs_fill.wish'),
        route: 'market.index.wish'
      });
    }

    // no parents - we are on the root
    if (_.isEmpty(parents)) return;

    let parentsInfo = await fetchSectionsInfo(parents);

    let bc_list = parentsInfo.slice(); // clone result to keep cache safe

    // transform fetched data & glue to output
    env.res.breadcrumbs = env.res.breadcrumbs.concat(
      bc_list.map(function (section_info) {
        return {
          text: section_info.title,
          route: 'market.section.' + (data.wish ? 'wish' : 'buy'),
          params: { section_hid: section_info.hid }
        };
      })
    );
  });
};
