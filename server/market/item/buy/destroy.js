// Remove item by id
//

'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    item_id: { format: 'mongo', required: true },
    reason:  { type: 'string' },
    method:  { type: 'string', 'enum': [ 'hard', 'soft' ], required: true }
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

    let item = await N.models.market.ItemOffer
                              .findById(env.params.item_id)
                              .lean(true);

    if (!item) {
      item = await N.models.market.ItemOfferArchived
                       .findById(env.params.item_id)
                       .lean(true);

      env.data.item_is_archived = true;
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

    let new_item = Object.assign({}, env.data.item, update);

    // move item to archive if it wasn't there already, update otherwise
    if (env.data.item_is_archived) {
      await N.models.market.ItemOfferArchived.updateOne({ _id: item._id }, update);
    } else {
      await N.models.market.ItemOffer.deleteOne({ _id: item._id });
      await N.models.market.ItemOfferArchived.create(new_item);
    }

    env.data.new_item = new_item;
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.market.ItemOfferHistory.add(
      {
        old_item: env.data.item,
        new_item: env.data.new_item
      },
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
    await N.queue.market_item_offers_search_update_by_ids([ env.data.item._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.market.Section.updateCache(env.data.item.section);
  });
};
