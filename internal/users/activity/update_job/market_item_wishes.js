// Recount number of market items created by a user
//
// Params:
//  - user_id (ObjectId)
//
// This internal method is used in `activity_update` task, so recount is
// delayed and performed in the background.
//
// It also may be used whenever we don't need delayed update
// (e.g. in seeds and vbconvert).
//

'use strict';


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function activity_fetch_market_item_wishes({ user_id }) {
    // check that user exists
    let user = await N.models.users.User.findById(user_id).lean(true);
    if (!user) return;

    let results = await N.models.market.ItemWish
                            .where('user').equals(user._id)
                            .where('st').equals(N.models.market.ItemWish.statuses.OPEN)
                            .countDocuments();

    let results_hb = await N.models.market.ItemWish
                               .where('user').equals(user._id)
                               .where('st').equals(N.models.market.ItemWish.statuses.HB)
                               .countDocuments();

    await N.models.market.UserItemWishCount.replaceOne(
      { user: user._id },
      { user: user._id, value: results, value_hb: results + results_hb },
      { upsert: true }
    );
  });
};
