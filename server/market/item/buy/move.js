// Move item
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid_to: { type: 'integer', required: true },
    item_id:        { format: 'mongo', required: true }
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


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    env.data.item = await N.models.market.ItemOffer
                              .findById(env.params.item_id)
                              .lean(true);

    if (!env.data.item) {
      env.data.item = await N.models.market.ItemOfferArchived
                                .findById(env.params.item_id)
                                .lean(true);
      env.data.item_is_archived = true;
    }

    if (!env.data.item) throw N.io.NOT_FOUND;
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


  // Move topic
  //
  N.wire.on(apiPath, async function move_topic(env) {
    if (String(env.data.item.section) === String(env.data.section_to._id)) return;

    if (env.data.item_is_archived) {
      await N.models.market.ItemOfferArchived.update(
        { _id: env.data.item._id },
        { $set: { section: env.data.section_to._id } }
      );
    } else {
      await N.models.market.ItemOffer.update(
        { _id: env.data.item._id },
        { $set: { section: env.data.section_to._id } }
      );
    }

    env.data.new_item = Object.assign({}, env.data.item, { section: env.data.section_to._id });
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
    if (String(env.data.item.section) === String(env.data.section_to._id)) return;

    await N.queue.market_item_offers_search_update_by_ids([ env.data.item._id ]).postpone();
  });


  // Update sections counters
  //
  N.wire.after(apiPath, async function update_sections(env) {
    if (String(env.data.item.section) === String(env.data.section_to._id)) return;

    await N.models.market.Section.updateCache(env.data.item.section);
    await N.models.market.Section.updateCache(env.data.section_to._id);
  });
};
