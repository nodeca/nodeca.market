// Restore multiple items
//
// Note: these items may be restored to either active and archived collections
//       depending on previous status, timestamp and expiration time
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
    item_ids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo', required: true }
    }
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    // this is a preliminary check, we'll need to test item status on
    // case-by-case basis to account for hard deleted items
    let market_mod_can_delete_items = await env.extras.settings.fetch('market_mod_can_delete_items');

    if (!market_mod_can_delete_items) throw N.io.FORBIDDEN;
  });


  // Fetch items
  //
  N.wire.before(apiPath, async function fetch_items(env) {
    let items_active = await N.models.market.ItemOffer.find()
                                 .where('_id').in(env.params.item_ids)
                                 .lean(true);

    let items_archived = await N.models.market.ItemOfferArchived.find()
                                   .where('_id').in(env.params.item_ids)
                                   .lean(true);

    let items = [].concat(items_active).concat(items_archived);

    let access_env = { params: {
      items,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

    env.data.items = items.filter((__, idx) => access_env.data.access_read[idx]);

    // make a map _id=>Boolean showing which collection the item is in
    env.data.item_is_archived = {};
    for (let item of items_archived) env.data.item_is_archived[item._id] = true;
    for (let item of items_active)   env.data.item_is_archived[item._id] = false;
  });


  // Restore items
  //
  N.wire.on(apiPath, async function restore_items(env) {
    env.data.changes = [];

    env.data.items_to_update = new Set();
    env.data.sections_to_update = new Set();

    let statuses = N.models.market.ItemOffer.statuses;
    let settings = await env.extras.settings.fetch([
      'market_mod_can_delete_items',
      'market_mod_can_see_hard_deleted_items'
    ]);

    let bulk_active = N.models.market.ItemOffer.collection.initializeUnorderedBulkOp();
    let bulk_archived = N.models.market.ItemOfferArchived.collection.initializeUnorderedBulkOp();

    for (let item of env.data.items) {
      if (!(item.st === statuses.DELETED && settings.market_mod_can_delete_items)) {
        if (!(item.st === statuses.DELETED_HARD && settings.market_mod_can_see_hard_deleted_items)) {
          continue;
        }
      }

      let update = {
        $set: {},
        $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
      };

      let prev_st = Object.assign({}, item.prev_st);

      if (item.autoclose_at_ts && item.autoclose_at_ts < Date.now()) {
        // undeleting previously open, but old item: should close automatically
        if (prev_st.st === statuses.HB && prev_st.ste === statuses.OPEN) {
          prev_st.ste = statuses.CLOSED;
        } else if (prev_st.st === statuses.OPEN) {
          prev_st.st = statuses.CLOSED;
        }
        update.$set.closed_at_ts = new Date();
      }

      Object.assign(update.$set, prev_st);

      let new_item = mongo_apply(item, update);

      env.data.changes.push({
        old_item: item,
        new_item
      });

      /* eslint-disable no-lonely-if */
      if (new_item.st === statuses.OPEN || new_item.ste === statuses.OPEN) {
        // item is open, so it should be in active collection now
        if (!env.data.item_is_archived[item._id]) {
          bulk_active.find({ _id: item._id }).updateOne(update);
        } else {
          bulk_archived.find({ _id: item._id }).deleteOne();
          bulk_active.insert(new_item);
          env.data.sections_to_update.add(String(item.section));
        }
      } else {
        // item should remain archived
        if (env.data.item_is_archived) {
          bulk_archived.find({ _id: item._id }).updateOne(update);
        } else {
          bulk_active.find({ _id: item._id }).deleteOne();
          bulk_archived.insert(new_item);
          env.data.sections_to_update.add(String(item.section));
        }
      }

      env.data.items_to_update.add(String(item._id));
    }

    if (bulk_archived.length === 0 && bulk_active.length === 0) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_items') };
    }

    if (bulk_archived.length > 0) await bulk_archived.execute();
    if (bulk_active.length > 0) await bulk_active.execute();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.market.ItemOfferHistory.add(
      env.data.changes,
      {
        user: env.user_info.user_id,
        role: N.models.market.ItemOfferHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.market_item_offers_search_update_by_ids(Array.from(env.data.items_to_update)).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    for (let section_id of env.data.sections_to_update) {
      await N.models.market.Section.updateCache(section_id);
    }
  });


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    let users = env.data.items.filter(item => env.data.items_to_update.has(String(item._id))).map(x => x.user);
    users = [ ...new Set(users.map(String)) ];

    await N.models.market.UserItemOfferCount.recount(users);
    await N.models.market.UserItemOfferArchivedCount.recount(users);
  });
};
