// Delete multiple items
//
// Note: these items may be from both active and archived collections
//       if an admin deletes those items from user's active items list
//       (which may have a small tail with selectable closed items)
//
'use strict';


const _ = require('lodash');


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
    },
    reason:  { type: 'string' },
    method:  { type: 'string', 'enum': [ 'hard', 'soft' ], required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let settings = await env.extras.settings.fetch([
      'market_mod_can_delete_items',
      'market_mod_can_hard_delete_items'
    ]);

    if (!settings.market_mod_can_delete_items && env.params.method === 'soft') {
      throw N.io.FORBIDDEN;
    }

    if (!settings.market_mod_can_hard_delete_items && env.params.method === 'hard') {
      throw N.io.FORBIDDEN;
    }
  });


  // Fetch items
  //
  N.wire.before(apiPath, async function fetch_items(env) {
    let items_active = await N.models.market.ItemWish.find()
                                 .where('_id').in(env.params.item_ids)
                                 .lean(true);

    let items_archived = await N.models.market.ItemWishArchived.find()
                                   .where('_id').in(env.params.item_ids)
                                   .lean(true);

    let items = [].concat(items_active).concat(items_archived);

    let access_env = { params: {
      items,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    env.data.items = items.filter((__, idx) => access_env.data.access_read[idx]);

    // makes a map _id=>Boolean showing which collection the item is in
    env.data.item_is_archived = Object.assign({},
      _.mapValues(_.keyBy(items_archived, '_id'), () => true),
      _.mapValues(_.keyBy(items_active, '_id'), () => false)
    );
  });


  // Delete items
  //
  N.wire.on(apiPath, async function delete_items(env) {
    env.data.items_to_update = new Set();
    env.data.sections_to_update = new Set();

    let statuses = N.models.market.ItemWish.statuses;
    let bulk_active = N.models.market.ItemWish.collection.initializeUnorderedBulkOp();
    let bulk_archived = N.models.market.ItemWishArchived.collection.initializeUnorderedBulkOp();

    for (let item of env.data.items) {
      if (item.st === statuses.DELETED || item.st === statuses.DELETED_HARD) {
        continue;
      }

      let update = {
        $set: {
          st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
          prev_st: _.pick(item, [ 'st', 'ste' ]),
          del_by: env.user_info.user_id
        },
        $unset: { ste: 1 }
      };

      if (env.params.reason) {
        update.$set.del_reason = env.params.reason;
      }

      // move item to archive if it wasn't there already, update otherwise
      if (env.data.item_is_archived[item._id]) {
        bulk_archived.find({ _id: item._id }).updateOne(update);
      } else {
        bulk_active.find({ _id: item._id }).removeOne();
        bulk_archived.insert(mongo_apply(item, update));
        env.data.sections_to_update.add(String(item.section));
      }

      env.data.items_to_update.add(String(item._id));
    }

    if (bulk_archived.length === 0 && bulk_active.length === 0) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_items') };
    }

    if (bulk_archived.length > 0) await bulk_archived.execute();
    if (bulk_active.length > 0) await bulk_active.execute();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.market_item_wishes_search_update_by_ids(Array.from(env.data.items_to_update)).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    for (let section_id of env.data.sections_to_update) {
      await N.models.market.Section.updateCache(section_id);
    }
  });
};
