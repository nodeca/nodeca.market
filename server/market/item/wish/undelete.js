// Restore item by id
//

'use strict';


// apply $set and $unset operations on an object
function mongo_apply(object, ops) {
  let result = Object.assign({}, object);

  for (let [ k, v ]  of Object.entries(ops)) {
    if (k === '$set') {
      Object.assign(result, v);
      continue;
    }

    if (k === '$unset') {
      for (let delete_key of Object.keys(v)) {
        delete result[delete_key];
      }
      continue;
    }

    result[k] = v;
  }

  return result;
}


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
    let item = await N.models.market.ItemWishArchived
                              .findById(env.params.item_id)
                              .lean(true);

    env.data.item_is_archived = true;

    if (!item) {
      // maybe item is already in active collection
      // (race condition or a mistake somewhere else)
      item = await N.models.market.ItemWish
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
    let statuses = N.models.market.ItemWish.statuses;

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


  // Undelete item
  //
  N.wire.on(apiPath, async function undelete_item(env) {
    let statuses = N.models.market.ItemWish.statuses;
    let market_items_expire = await N.settings.get('market_items_expire');
    let item = env.data.item;

    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    let prev_st = Object.assign({}, item.prev_st);

    if (market_items_expire > 0 && item.ts < Date.now() - market_items_expire * 24 * 60 * 60 * 1000) {
      // undeleting previously open, but old item: should close automatically
      if (prev_st.st === statuses.HB && prev_st.ste === statuses.OPEN) {
        prev_st.ste = statuses.CLOSED;
      } else if (prev_st.st === statuses.OPEN) {
        prev_st.st = statuses.CLOSED;
      }
    }

    Object.assign(update, prev_st);

    let new_item = mongo_apply(env.data.item, update);

    /* eslint-disable no-lonely-if */
    if (new_item.st === statuses.OPEN || new_item.ste === statuses.OPEN) {
      // item is open, so it should be in active collection now
      if (!env.data.item_is_archived) {
        await N.models.market.ItemWish.updateOne({ _id: item._id }, update);
      } else {
        await N.models.market.ItemWishArchived.deleteOne({ _id: item._id });
        await N.models.market.ItemWish.create(new_item);
      }
    } else {
      // item should remain archived
      if (env.data.item_is_archived) {
        await N.models.market.ItemWishArchived.updateOne({ _id: item._id }, update);
      } else {
        await N.models.market.ItemWish.deleteOne({ _id: item._id });
        await N.models.market.ItemWishArchived.create(new_item);
      }
    }

    env.data.new_item = new_item;
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.market.ItemWishHistory.add(
      {
        old_item: env.data.item,
        new_item: env.data.new_item
      },
      {
        user: env.user_info.user_id,
        role: N.models.market.ItemWishHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.market_item_wishes_search_update_by_ids([ env.data.item._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.market.Section.updateCache(env.data.item.section);
  });


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    await N.models.market.UserItemWishCount.recount(env.data.item.user);
    await N.models.market.UserItemWishArchivedCount.recount(env.data.item.user);
  });
};
