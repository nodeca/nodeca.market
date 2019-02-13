// Get a specified amount of items before or after item with given _id
//
'use strict';


const _  = require('lodash');

const LIMIT = 50; // max items to fetch before and after


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid: { type: 'integer', minimum: 1, required: true },
    start:    { format: 'mongo', required: true },
    before:   { type: 'integer', minimum: 0, maximum: LIMIT, required: true },
    after:    { type: 'integer', minimum: 0, maximum: LIMIT, required: true }
  });


  let build_item_ids = require('./_build_item_ids_by_range')(N);


  // Fetch owner
  //
  N.wire.before(apiPath, function fetch_user_by_hid(env) {
    return N.wire.emit('internal:users.fetch_user_by_hid', env);
  });


  // Forbid access to pages owned by bots
  //
  N.wire.before(apiPath, async function bot_member_pages_forbid_access(env) {
    let is_bot = await N.settings.get('is_bot', {
      user_id: env.data.user._id,
      usergroup_ids: env.data.user.usergroups
    }, {});

    if (is_bot) throw N.io.NOT_FOUND;
  });


  // Subcall item list
  //
  N.wire.on(apiPath, async function subcall_item_list(env) {
    env.data.select_start   = env.params.start;
    env.data.select_before  = env.params.before;
    env.data.select_after   = env.params.after;
    env.data.build_item_ids = build_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.item_offer_closed_list', env);
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

      let item = await N.models.market.ItemOfferArchived.findOne()
                           .where('user').equals(env.data.user._id)
                           .where('_id').lt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('-_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.next = N.router.linkTo('market.user.buy_closed', {
          user_hid: env.data.user.hid,
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

      let item = await N.models.market.ItemOfferArchived.findOne()
                           .where('user').equals(env.data.user._id)
                           .where('_id').gt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.prev = N.router.linkTo('market.user.buy_closed', {
          user_hid: env.data.user.hid,
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
      env.data.items_visible_statuses.map(st =>
        N.models.market.ItemOfferArchived
            .where('user').equals(env.data.user._id)
            .where('st').equals(st)
            .countDocuments()
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
          N.models.market.ItemOfferArchived
              .where('user').equals(env.data.user._id)
              .where('st').equals(st)
              .where('_id').gt(env.data.items[0]._id)
              .countDocuments()
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
};
