// Archive item by id
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

    let item = await N.models.market.ItemOffer
                              .findById(env.params.item_id)
                              .lean(true);

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
    //
    // Check moderator permissions
    //
    if (env.params.as_moderator) {
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


  // Close item
  //
  N.wire.on(apiPath, async function close_item(env) {
    let statuses = N.models.market.ItemOffer.statuses;

    let item = env.data.item;
    let update;

    if (item.st === statuses.HB) {
      update = { ste: statuses.CLOSED };
    } else {
      update = { st: statuses.CLOSED };
    }

    // move item to archive
    await N.models.market.ItemOffer.remove({ _id: item._id });
    await N.models.market.ItemOfferArchived.create(Object.assign({}, env.data.item, update));
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
