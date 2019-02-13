// Get a specified amount of items before or after item with given _id
//
'use strict';


const _  = require('lodash');

const LIMIT = 50; // max items to fetch before and after


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', minimum: 1, required: true },
    start:       { format: 'mongo', required: true },
    before:      { type: 'integer', minimum: 0, maximum: LIMIT, required: true },
    after:       { type: 'integer', minimum: 0, maximum: LIMIT, required: true }
  });


  let build_item_ids = require('./_build_item_ids_by_range')(N);


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let section = await N.models.market.Section.findOne({ hid: env.params.section_hid }).lean(true);

    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;
  });


  // Get all subsections to search items in
  //
  N.wire.before(apiPath, async function fetch_subsections(env) {
    let children = await N.models.market.Section.getChildren(env.data.section._id, Infinity);

    children = children.filter(s => !s.is_linked);

    let section_ids = [ env.data.section._id ];

    if (children.length > 0) section_ids = section_ids.concat(_.map(children, '_id'));

    env.data.section_ids = section_ids;
  });


  // Subcall item list
  //
  N.wire.on(apiPath, async function subcall_item_list(env) {
    env.data.select_start   = env.params.start;
    env.data.select_before  = env.params.before;
    env.data.select_after   = env.params.after;
    env.data.build_item_ids = build_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.item_wish_active_list', env);
  });


  // Fill 'prev' and 'next' links and meta tags
  //
  N.wire.after(apiPath, async function fill_prev_next(env) {
    env.res.head = env.res.head || {};

    //
    // Fetch item after last one, turn it into a link to the next page
    //
    if (env.params.after > 0 && env.data.items.length > 0) {
      let last_item_id = env.data.items[0]._id;

      let item = await N.models.market.ItemWish.findOne()
                           .where('section').in(env.data.section_ids)
                           .where('_id').lt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('-_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.next = N.router.linkTo('market.section.wish', {
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
    if (env.params.before > 0 && env.data.items.length > 0) {
      let last_item_id = env.data.items[0]._id;

      let item = await N.models.market.ItemWish.findOne()
                           .where('section').in(env.data.section_ids)
                           .where('_id').gt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.prev = N.router.linkTo('market.section.wish', {
          section_hid: env.data.section.hid,
          $query: {
            from: String(env.data.items[0].hid),
            prev: ''
          }
        });
      }
    }
  });


  // Fill pagination (progress)
  //
  N.wire.after(apiPath, async function fill_pagination(env) {
    //
    // Count total amount of visible items
    //
    let counters_by_status = await Promise.all(
      env.data.items_visible_statuses.map(st => Promise.all(
        env.data.section_ids.map(section_id =>
          N.models.market.ItemWish
              .where('section').equals(section_id)
              .where('st').equals(st)
              .countDocuments()
        )
      ))
    );

    let total = _.sum(_.flatten(counters_by_status));

    //
    // Count an amount of visible items before the first displayed
    //
    let offset = 0;

    if (env.data.items.length) {
      let counters_by_status = await Promise.all(
        env.data.items_visible_statuses.map(st => Promise.all(
          env.data.section_ids.map(section_id =>
            N.models.market.ItemWish
                .where('section').equals(section_id)
                .where('st').equals(st)
                .where('_id').gt(env.data.items[0]._id)
                .countDocuments()
          )
        ))
      );

      offset = _.sum(_.flatten(counters_by_status));
    }

    env.res.pagination = {
      total,
      per_page:     env.data.items_per_page,
      chunk_offset: offset
    };
  });
};
