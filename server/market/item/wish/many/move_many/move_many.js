// Move multiple items
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid_to: { type: 'integer', required: true },
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
    let market_mod_can_move_items = await env.extras.settings.fetch('market_mod_can_move_items');

    if (!market_mod_can_move_items) throw N.io.FORBIDDEN;
  });


  // Fetch destination section, check that it's not a category
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    env.data.section_to = await N.models.market.Section.findOne({ hid: env.params.section_hid_to }).lean(true);
    if (!env.data.section_to) throw N.io.NOT_FOUND;

    // Cannot move to a category. Should never happen - restricted on client
    if (env.data.section_to.is_category) throw N.io.BAD_REQUEST;
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


  // Move items
  //
  N.wire.on(apiPath, async function move_items(env) {
    env.data.changes = [];

    env.data.items_to_update = new Set();
    env.data.sections_to_update = new Set();

    let bulk_active = N.models.market.ItemWish.collection.initializeUnorderedBulkOp();
    let bulk_archived = N.models.market.ItemWishArchived.collection.initializeUnorderedBulkOp();

    for (let item of env.data.items) {
      if (String(item.section) === String(env.data.section_to)) continue;

      env.data.changes.push({
        old_item: item,
        new_item: Object.assign({}, item, { section: env.data.section_to._id })
      });

      if (env.data.item_is_archived[item._id]) {
        bulk_archived.find({ _id: item._id }).updateOne({
          $set: { section: env.data.section_to._id }
        });
      } else {
        bulk_active.find({ _id: item._id }).updateOne({
          $set: { section: env.data.section_to._id }
        });
      }

      env.data.items_to_update.add(String(item._id));
      env.data.sections_to_update.add(String(item.section));
      env.data.sections_to_update.add(String(env.data.section_to._id));
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
    return N.models.market.ItemWishHistory.add(
      env.data.changes,
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
