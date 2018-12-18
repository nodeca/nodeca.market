// Make item active (return from archive)
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    item_id:      { format: 'mongo', required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    let statuses = N.models.market.ItemOffer.statuses;

    let item = await N.models.market.ItemOfferArchived
                              .findById(env.params.item_id)
                              .lean(true);

    env.data.item_is_archived = true;

    if (!item) {
      // maybe item is already in active collection
      // (race condition or a mistake somewhere else)
      item = await N.models.market.ItemOffer
                       .findById(env.params.item_id)
                       .lean(true);

      env.data.item_is_archived = false;
    }

    if (!item) throw N.io.NOT_FOUND;

    if (item.st === statuses.DELETED || item.st === statuses.DELETED_HARD) {
      throw N.io.NOT_FOUND;
    }

    env.data.item = item;
  });


  // Check if user can see this item
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      items: env.data.item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let market_items_expire = await N.settings.get('market_items_expire');

    // cannot open old items (pointless, they'd be auto-closed again),
    // is restricted on the client also
    if (market_items_expire > 0 && env.data.item.ts < Date.now() - market_items_expire * 24 * 60 * 60 * 1000) {
      throw N.io.FORBIDDEN;
    }

    //
    // Check moderator permissions
    //
    if (env.params.as_moderator) {
      let settings = await env.extras.settings.fetch([
        'market_mod_can_move_items'
      ]);

      if (!settings.market_mod_can_move_items) {
        throw N.io.FORBIDDEN;
      }

      return;
    }

    //
    // Check permissions as owner
    //
    let market_can_create_items = await env.extras.settings.fetch('market_can_create_items');

    if ((env.user_info.user_id !== String(env.data.item.user)) || !market_can_create_items) {
      throw N.io.FORBIDDEN;
    }
  });


  // Open item
  //
  N.wire.on(apiPath, async function open_item(env) {
    let statuses = N.models.market.ItemOffer.statuses;

    let item = env.data.item;
    let update;

    if (item.st === statuses.HB) {
      update = { ste: statuses.OPEN };
    } else {
      update = { st: statuses.OPEN };
    }

    let new_item = Object.assign({}, env.data.item, update);

    // move item to active collection if it wasn't there already, update otherwise
    if (!env.data.item_is_archived) {
      await N.models.market.ItemOffer.update({ _id: item._id }, update);
    } else {
      await N.models.market.ItemOfferArchived.remove({ _id: item._id });
      await N.models.market.ItemOffer.create(new_item);
    }

    env.data.new_item = new_item;
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.market.ItemOfferHistory.add(
      env.data.item,
      env.data.new_item,
      {
        user: env.user_info.user_id,
        role: N.models.market.ItemOfferHistory.roles[env.params.as_moderator ? 'MODERATOR' : 'USER'],
        ip:   env.req.ip
      }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.market_item_offers_search_update_by_ids([ env.data.item._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.market.Section.updateCache(env.data.item.section);
  });
};
