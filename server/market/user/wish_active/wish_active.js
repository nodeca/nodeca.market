// Show market offers from a user
//

'use strict';


const ObjectId = require('mongoose').Types.ObjectId;


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid: { type: 'integer', minimum: 1, required: true },
    $query:   { // from is used on client-side to highlight level-up
      type: 'object',
      properties: {
        from: { type: 'string' }
      },
      additionalProperties: false
    }
  });


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


  // Return all active item ids for this user
  //
  async function build_active_item_ids(env) {
    let entries = await N.models.market.ItemWish.find()
                            .where('user').equals(env.data.user._id)
                            .where('st').in(env.data.items_visible_statuses)
                            .sort('-_id')
                            .select('_id')
                            .lean(true);

    env.data.item_ids = entries.map(x => x._id);
  }


  // Subcall active item list
  //
  N.wire.on(apiPath, async function subcall_active_item_list(env) {
    env.data.build_item_ids = build_active_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.item_wish_active_list', env);

    env.res.items_active = env.res.items;
    env.data.items = env.res.items = [];
  });


  // Return all closed item ids for this user
  //
  async function build_closed_item_ids(env) {
    let query = N.models.market.ItemWishArchived.find()
                    .where('user').equals(env.data.user._id)
                    .where('st').in(env.data.items_visible_statuses)
                    .sort('-_id')
                    .select('_id');

    // limit results to last 2 months
    let cutoff = Date.now() - 2 * 30 * 24 * 60 * 60 * 1000;

    query = query.where('_id').gt(new ObjectId(cutoff / 1000));

    // limit results to one page
    query = query.limit(env.data.items_per_page);

    let entries = await query.lean(true);

    env.data.item_ids = entries.map(x => x._id);
  }


  // Subcall closed item list
  //
  N.wire.on(apiPath, async function subcall_closed_item_list(env) {
    env.data.build_item_ids = build_closed_item_ids;
    env.data.items_per_page = await env.extras.settings.fetch('market_items_per_page');

    await N.wire.emit('internal:market.item_wish_closed_list', env);

    env.res.items_closed = env.res.items;
    env.data.items = env.res.items = [];
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
    let total = env.res.stats.active_wishes;
    let offset = 0;

    env.res.pagination = {
      total,
      per_page:     env.data.items_per_page,
      chunk_offset: offset
    };

    env.res.last_item_hid = env.res.items_active?.length ?
                            env.res.items_active[env.res.items_active.length - 1].hid :
                            0;
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
};
