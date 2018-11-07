// Move item
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid_from: { type: 'integer', required: true },
    section_hid_to:   { type: 'integer', required: true },
    item_id:          { format: 'mongo', required: true }
  });


  // Fetch sections
  //
  N.wire.before(apiPath, async function fetch_sections(env) {
    env.data.section_from = await N.models.market.Section.findOne({ hid: env.params.section_hid_from }).lean(true);
    if (!env.data.section_from) throw N.io.NOT_FOUND;

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
    // if moving to the same section, report success and do nothing
    env.data.is_move_valid = String(env.data.item.section) === String(env.data.section_from._id) &&
                             String(env.data.item.section) !== String(env.data.section_to._id);

    if (!env.data.is_move_valid) return;

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
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    if (!env.data.is_move_valid) return;

    await N.queue.market_item_offers_search_update_by_ids([ env.data.item._id ]).postpone();
  });


  // Update sections counters
  //
  N.wire.after(apiPath, async function update_sections(env) {
    if (!env.data.is_move_valid) return;

    await N.models.market.Section.updateCache(env.data.section_from._id);
    await N.models.market.Section.updateCache(env.data.section_to._id);
  });

  // TODO: log moderator actions
};
