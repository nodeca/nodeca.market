// Market section
//

'use strict';


const _       = require('lodash');
const memoize = require('promise-memoize');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    $query:      {
      type: 'object',
      properties: {
        from: { type: 'string' },
        prev: { 'const': '' },
        next: { 'const': '' }
      },
      additionalProperties: false
    }
  });


  let build_item_ids_by_range = require('./list/_build_item_ids_by_range')(N);


  let fetchSection = memoize(id =>
    N.models.market.Section.findById(id).lean(true).exec(), { maxAge: 60000 });


  async function build_item_ids(env) {
    let prev = false, next = false, start = null;

    if (env.params.$query) {
      let query = env.params.$query;

      prev = typeof query.prev !== 'undefined';
      next = typeof query.next !== 'undefined';

      // get hid by id
      if (query.from && _.isInteger(+query.from)) {
        let item = await N.models.market.ItemOffer.findOne()
                              .where('section').equals(env.data.section._id)
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


  // Subcall item list
  //
  N.wire.on(apiPath, async function subcall_item_list(env) {
    env.data.section_hid    = env.params.section_hid;
    env.data.build_item_ids = build_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.section_item_offer_list', env);
  });


  // Fill sections via subcall
  //
  N.wire.after(apiPath, function subsections_fill_subcall(env) {
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


  // Fill pagination (progress)
  //
  N.wire.after(apiPath, async function fill_pagination(env) {
    //
    // Count total amount of visible items
    //
    let counters_by_status = await Promise.all(
      env.data.items_visible_statuses.map(st =>
        N.models.market.ItemOffer
            .where('section').equals(env.data.section._id)
            .where('st').equals(st)
            .count()
      )
    );

    let total = _.sum(counters_by_status);

    //
    // Count an amount of visible items before the first displayed
    //
    let offset = 0;

    if (env.data.items.length) {
      let counters_by_status = await Promise.all(
        env.data.items_visible_statuses.map(st =>
          N.models.market.ItemOffer
              .where('section').equals(env.data.section._id)
              .where('st').equals(st)
              .where('_id').gt(env.data.items[0]._id)
              .count()
        )
      );

      offset = _.sum(counters_by_status);
    }

    env.res.pagination = {
      total,
      per_page:     env.data.items_per_page,
      chunk_offset: offset
    };
  });


  // Fill available currencies
  //
  N.wire.after(apiPath, async function fill_options(env) {
    let c = N.config.market.currencies || {};

    env.res.currency_types = Object.keys(c)
                               .sort((a, b) => ((c[a] || {}).priority || 100) - ((c[b] || {}).priority || 100));
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.data.section.title;

    if (env.params.$query && env.params.$query.from) {
      env.res.head.robots = 'noindex,follow';
    }
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    let parents = await N.models.market.Section.getParentList(env.data.section._id);

    await N.wire.emit('internal:market.breadcrumbs_fill', { env, parents });
  });


  // Get parent section
  //
  N.wire.after(apiPath, async function fill_parent_hid(env) {
    let parents = await N.models.market.Section.getParentList(env.data.section._id);

    if (!parents.length) return;

    let section = await fetchSection(parents[parents.length - 1]);

    if (!section) return;

    env.res.section_level = parents.length;
    env.res.parent_hid = section.hid;
  });


  // Fill 'prev' and 'next' links and meta tags
  //
  N.wire.after(apiPath, async function fill_prev_next(env) {
    env.res.head = env.res.head || {};

    //
    // Fetch item after last one, turn it into a link to the next page
    //
    if (env.data.items.length > 0) {
      let last_item_id = env.data.items[0]._id;

      let item = await N.models.market.ItemOffer.findOne()
                           .where('section').equals(env.data.section._id)
                           .where('_id').lt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('-_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.next = N.router.linkTo('market.section.buy', {
          section_hid: env.data.section.hid,
          $query: {
            from: String(env.data.items[env.data.items.length - 1].hid),
            next: ''
          }
        });
      }
    }

    //
    // Fetch item before first one, turn it into a link to the previous page
    //
    if (env.data.items.length > 0) {
      let last_item_id = env.data.items[0]._id;

      let item = await N.models.market.ItemOffer.findOne()
                           .where('section').equals(env.data.section._id)
                           .where('_id').gt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.prev = N.router.linkTo('market.section.buy', {
          section_hid: env.data.section.hid,
          $query: {
            from: String(env.data.items[0].hid),
            prev: ''
          }
        });
      }
    }

    //
    // Fetch last item for the "move to bottom" button
    //
    if (env.data.items.length > 0) {
      let item = await N.models.market.ItemOffer.findOne()
                           .where('section').equals(env.data.section._id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('hid -_id')
                           .sort('_id')
                           .lean(true);

      if (item) {
        env.res.last_item_hid = item.hid;
      }
    }
  });
};
