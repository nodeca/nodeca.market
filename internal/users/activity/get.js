// Get user activity counters for market items
//
// Params:
//  - data.user_id (ObjectId)
//  - data.current_user_id (Object), same as env.user_info
//
// Returns:
//  - data.count (Number)
//

'use strict';


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, { parallel: true }, async function activity_get_market(data) {
    let count = (await Promise.all([
      N.models.market.UserItemOfferCount.get(data.user_id, data.current_user_info),
      N.models.market.UserItemOfferArchivedCount.get(data.user_id, data.current_user_info),
      N.models.market.UserItemWishCount.get(data.user_id, data.current_user_info),
      N.models.market.UserItemWishArchivedCount.get(data.user_id, data.current_user_info)
    ])).reduce((a, b) => a + b, 0);

    data.count += count;
  });
};
