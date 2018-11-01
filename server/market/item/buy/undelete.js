// Restore item by id
//

'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    item_id: { format: 'mongo', required: true }
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

    env.data.item = item;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let statuses = N.models.market.ItemOffer.statuses;

    let settings = await env.extras.settings.fetch([
      'market_mod_can_delete_items',
      'market_mod_can_see_hard_deleted_items'
    ]);

    if (env.data.item.st === statuses.DELETED && settings.market_mod_can_delete_items) {
      return;
    }

    if (env.data.item.st === statuses.DELETED_HARD && settings.market_mod_can_see_hard_deleted_items) {
      return;
    }

    // We should not show that item exists if no permissions
    throw N.io.NOT_FOUND;
  });


  // Remove item
  //
  N.wire.on(apiPath, async function delete_item(env) {
    let statuses = N.models.market.ItemOffer.statuses;

    let item = env.data.item;
    let update = {
      st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
      $unset: { ste: 1 },
      prev_st: _.pick(item, [ 'st', 'ste' ]),
      del_by: env.user_info.user_id
    };

    if (env.params.reason) {
      update.del_reason = env.params.reason;
    }

    // move item to archive if it wasn't there already, update otherwise
    if (env.data.item_is_archived) {
      await N.models.market.ItemOfferArchived.update({ _id: item._id }, update);
    } else {
      await N.models.market.ItemOffer.remove({ _id: item._id });
      await N.models.market.ItemOfferArchived.create(Object.assign({}, env.data.item, update));
    }
  });


  // Undelete item
  //
  N.wire.on(apiPath, async function undelete_item(env) {
    let statuses = N.models.market.ItemOffer.statuses;
    let item = env.data.item;

    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, item.prev_st);

    await N.models.market.ItemOffer.update({ _id: item._id }, update);

    if (item.prev_st.st === statuses.OPEN || item.prev_st.ste === statuses.OPEN) {
      // item is open, so it should be in active collection now
      if (!env.data.item_is_archived) {
        await N.models.market.ItemOffer.update({ _id: item._id }, update);
      } else {
        await N.models.market.ItemOfferArchived.remove({ _id: item._id });
        await N.models.market.ItemOffer.create(Object.assign({}, env.data.item, update));
      }
    } else {
      // item should remain archived
      if (env.data.item_is_archived) {
        await N.models.market.ItemOfferArchived.update({ _id: item._id }, update);
      } else {
        await N.models.market.ItemOffer.remove({ _id: item._id });
        await N.models.market.ItemOfferArchived.create(Object.assign({}, env.data.item, update));
      }
    }
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

  // TODO: log moderator actions
};
