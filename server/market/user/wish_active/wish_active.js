// Show market offers from a user
//

'use strict';

const _  = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid: { type: 'integer', minimum: 1, required: true }
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


  async function build_item_ids(env) {
    env.data.select_start  = null;
    env.data.select_before = 0;

    // need to display all items, it's highly unlikely user will have this much
    env.data.select_after  = 1000;

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
    let offer_statuses = N.models.market.ItemOffer.statuses;
    let wish_statuses  = N.models.market.ItemWish.statuses;

    let offer_visible_st_active  = [ offer_statuses.OPEN ];
    let offer_visible_st_archive = [ offer_statuses.CLOSED ];
    let wish_visible_st_active   = [ wish_statuses.OPEN ];
    let wish_visible_st_archive  = [ wish_statuses.CLOSED ];

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      offer_visible_st_active.push(offer_statuses.HB);
      offer_visible_st_archive.push(offer_statuses.HB);
      wish_visible_st_active.push(wish_statuses.HB);
      wish_visible_st_archive.push(wish_statuses.HB);
    }

    if (env.data.settings.market_mod_can_delete_items) {
      offer_visible_st_archive.push(offer_statuses.DELETED);
      wish_visible_st_archive.push(wish_statuses.DELETED);
    }

    if (env.data.settings.market_mod_can_see_hard_deleted_items) {
      offer_visible_st_archive.push(offer_statuses.DELETED_HARD);
      wish_visible_st_archive.push(wish_statuses.DELETED_HARD);
    }

    let [
      active_offers,
      closed_offers,
      active_wishes,
      closed_wishes
    ] = await Promise.all([
      Promise.all(
        offer_visible_st_active.map(st =>
          N.models.market.ItemOffer
              .where('user').equals(env.data.user._id)
              .where('st').equals(st)
              .count()
        )
      ),
      Promise.all(
        offer_visible_st_archive.map(st =>
          N.models.market.ItemOfferArchived
              .where('user').equals(env.data.user._id)
              .where('st').equals(st)
              .count()
        )
      ),
      Promise.all(
        wish_visible_st_active.map(st =>
          N.models.market.ItemWish
              .where('user').equals(env.data.user._id)
              .where('st').equals(st)
              .count()
        )
      ),
      Promise.all(
        wish_visible_st_archive.map(st =>
          N.models.market.ItemWishArchived
              .where('user').equals(env.data.user._id)
              .where('st').equals(st)
              .count()
        )
      )
    ]);

    env.res.stats = {
      active_offers: _.sum(active_offers),
      closed_offers: _.sum(closed_offers),
      active_wishes: _.sum(active_wishes),
      closed_wishes: _.sum(closed_wishes)
    };
  });


  // Fill pagination (progress)
  //
  N.wire.after(apiPath, async function fill_pagination(env) {
    let total = env.res.stats.active_offers;
    let offset = 0;

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
    env.res.user_hid = env.data.user.hid;
  });


  // Fill breadcrumbs
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    await N.wire.emit('internal:users.breadcrumbs.fill_root', env);

    env.res.breadcrumbs = env.data.breadcrumbs;
  });
};
