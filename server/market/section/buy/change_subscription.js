// Subscribe to market section
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    type:        { type: 'integer', required: true }
  });


  // Check type
  //
  N.wire.before(apiPath, function check_type(env) {
    if (Object.values(N.models.users.Subscription.types).indexOf(env.params.type) === -1) {
      return N.io.BAD_REQUEST;
    }

    // MUTED subscription isn't available for market sections,
    // guard against user changing request manually from js console somehow
    if (env.params.type === N.models.users.Subscription.types.MUTED) {
      return N.io.BAD_REQUEST;
    }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let section = await N.models.market.Section.findOne()
                            .where('hid').equals(env.params.section_hid)
                            .lean(true);

    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;
  });


  // Add/remove subscription
  //
  N.wire.on(apiPath, async function subscription_add_remove(env) {
    // Use `update` with `upsert` to avoid duplicates in case of multi click
    await N.models.users.Subscription.updateOne(
      {
        user: env.user_info.user_id,
        to: env.data.section._id,
        // user subscribes separately to offers and wishes,
        // so for market sections we always have to check subscription type
        to_type: N.shared.content_type.MARKET_SECTION_OFFER
      },
      { type: env.params.type },
      { upsert: true });
  });
};
