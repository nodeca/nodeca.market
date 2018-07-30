// Market section
//

'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    $query:      {
      type: 'object',
      properties: {
        prev: { 'const': '' },
        next: { 'const': '' }
      },
      additionalProperties: false
    }
  });


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let section = await N.models.market.Section.findOne()
                            .where('hid').equals(env.params.section_hid)
                            .lean(true);

    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;
  });


  let build_item_ids_by_range = require('./list/_build_item_ids_by_range')(N);

  async function build_item_ids(env) {
    let prev = false, next = false, start = null;

    if (env.params.$query) {
      let query = env.params.$query;

      prev = typeof query.prev !== 'undefined';
      next = typeof query.next !== 'undefined';

      // get hid by id
      if (query.from && _.isInteger(+query.from)) {
        let item = await N.models.market.ItemRequest.findOne()
                              .where('user').equals(env.data.user._id)
                              .where('hid').equals(+query.from)
                              .where('st').in(env.data.items_visible_statuses)
                              .select('_id')
                              .lean(true);

        if (item) start = item._id;
      }
    }

    let limit_direction = prev || next;

    env.data.select_start  = start;
    env.data.select_before = (!limit_direction || prev) ? env.data.items_per_page : 0;
    env.data.select_after  = (!limit_direction || next) ? env.data.items_per_page : 0;

    return build_item_ids_by_range(env);
  }


  // Subcall market.item_list
  //
  N.wire.on(apiPath, async function subcall_item_list(env) {
    env.data.section_hid    = env.params.section_hid;
    env.data.build_item_ids = build_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.item_request_list', env);
  });


  // Fill sections via subcall
  //
  N.wire.after(apiPath, function subsections_fill_subcall(env) {
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
    env.res.head.title = env.data.section.title;
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    let parents = await N.models.market.Section.getParentList(env.data.section._id);

    await N.wire.emit('internal:market.breadcrumbs_fill', { env, parents, buy: true });
  });


  // Sanitize section
  //
  N.wire.after(apiPath, async function section_sanitize(env) {
    env.res.section = await sanitize_section(N, env.data.section, env.user_info);
  });
};
