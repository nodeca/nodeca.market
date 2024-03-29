// Show market offers from a user
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid: { type: 'integer', minimum: 1, required: true },
    $query:   {
      type: 'object',
      properties: {
        from: { format: 'pos_int_str' },
        prev: { const: '' },
        next: { const: '' }
      },
      additionalProperties: false
    }
  });


  let build_item_ids_by_range = require('./list/_build_item_ids_by_range')(N);


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


  // Build item ids based on page parameters (start and direction);
  // direction is only used for no-javascript users and bots
  //
  async function build_item_ids(env) {
    let prev = false, next = false, start = null;

    if (env.params.$query) {
      let query = env.params.$query;

      prev = typeof query.prev !== 'undefined';
      next = typeof query.next !== 'undefined';

      // get hid by id
      if (query.from && Number.isInteger(+query.from)) {
        let item = await N.models.market.ItemWishArchived.findOne()
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


  // Subcall item list
  //
  N.wire.on(apiPath, async function subcall_item_list(env) {
    env.data.build_item_ids = build_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.item_wish_closed_list', env);
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


  // Fetch number of offers and wishes (both active and closed),
  // needed to display this information on tabs
  //
  N.wire.after(apiPath, async function fetch_stats(env) {
    let [
      active_offers,
      closed_offers,
      active_wishes,
      closed_wishes
    ] = await Promise.all([
      N.models.market.UserItemOfferCount.get(env.data.user._id, env.user_info),
      N.models.market.UserItemOfferArchivedCount.get(env.data.user._id, env.user_info),
      N.models.market.UserItemWishCount.get(env.data.user._id, env.user_info),
      N.models.market.UserItemWishArchivedCount.get(env.data.user._id, env.user_info)
    ]);

    env.res.stats = {
      active_offers,
      closed_offers,
      active_wishes,
      closed_wishes
    };
  });


  // Fill pagination (progress)
  //
  N.wire.after(apiPath, async function fill_pagination(env) {
    let total = env.res.stats.closed_wishes;

    //
    // Count an amount of visible items before the first displayed
    //
    let offset = 0;

    if (env.data.items.length) {
      let counters_by_status = await Promise.all(
        env.data.items_visible_statuses.map(st =>
          N.models.market.ItemWishArchived
              .where('user').equals(env.data.user._id)
              .where('st').equals(st)
              .where('_id').gt(env.data.items[0]._id)
              .countDocuments()
        )
      );

      offset = counters_by_status.reduce((a, b) => a + b, 0);
    }

    env.res.pagination = {
      total,
      per_page:     env.data.items_per_page,
      chunk_offset: offset
    };
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    let user = env.data.user;

    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title_with_user', { user: env.user_info.is_member ? user.name : user.nick });
    env.res.user_id = env.data.user._id;

    env.data.users = env.data.users || [];
    env.data.users.push(env.data.user._id);

    if (env.params.$query?.from) {
      env.res.head.robots = 'noindex,follow';
    }
  });


  // Fill breadcrumbs
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    env.res.breadcrumbs = [ {
      text: env.t('@common.menus.navbar.market'),
      route: 'market.index.buy'
    } ];
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

      let item = await N.models.market.ItemWishArchived.findOne()
                           .where('user').equals(env.data.user._id)
                           .where('_id').lt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('-_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.next = N.router.linkTo('market.user.wish_closed', {
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
    if (env.data.items.length > 0) {
      let last_item_id = env.data.items[0]._id;

      let item = await N.models.market.ItemWishArchived.findOne()
                           .where('user').equals(env.data.user._id)
                           .where('_id').gt(last_item_id)
                           .where('st').in(env.data.items_visible_statuses)
                           .select('_id')
                           .sort('_id')
                           .lean(true);

      // `item` is only used to check if there is a post afterwards
      if (item) {
        env.res.head.prev = N.router.linkTo('market.user.wish_closed', {
          user_hid: env.data.user.hid,
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
      let item = await N.models.market.ItemWishArchived.findOne()
                           .where('user').equals(env.data.user._id)
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
