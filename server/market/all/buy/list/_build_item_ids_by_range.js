// Reflection helper for `internal:market.all.buy`:
//
// Builds IDs of market items to fetch for current page
//
// In:
//
// - env.user_info.hb
// - env.data.select_before
// - env.data.select_after
// - env.data.select_start
// - env.data.items_visible_statuses
//
// Out:
//
// - env.data.item_ids
//
// Needed in:
//
// - `market/all/buy/buy.js`
// - `market/all/buy/list/by_range.js`
//
'use strict';


module.exports = function (N) {

  async function select_visible_before(env) {
    if (env.data.select_before <= 0) return [];

    // first page, don't need to fetch anything
    if (!env.data.select_start) return [];

    let query = N.models.market.ItemOffer.find();

    let entries = await query
                          .where('st').in(env.data.items_visible_statuses)
                          .where('_id').gt(env.data.select_start)
                          .sort('_id')
                          .select('_id')
                          .limit(env.data.select_before)
                          .lean(true);

    return entries.map(x => x._id).reverse();
  }


  async function select_visible_after(env) {
    let count = env.data.select_after;

    if (env.data.select_after <= 0) return [];

    let query = N.models.market.ItemOffer.find();

    if (env.data.select_start) {
      if (env.data.select_after > 0 && env.data.select_before > 0) {
        // if we're selecting both `after` and `before`, include current message
        // in the result, otherwise don't
        query = query.where('_id').lte(env.data.select_start);
        count++;
      } else {
        query = query.where('_id').lt(env.data.select_start);
      }
    }

    let entries = await query
                          .where('st').in(env.data.items_visible_statuses)
                          .sort('-_id')
                          .select('_id')
                          .limit(count)
                          .lean(true);

    return entries.map(x => x._id);
  }


  return async function buildEntryIds(env) {
    // Run both functions in parallel and concatenate results
    //
    let results = await Promise.all([ select_visible_before(env), select_visible_after(env) ]);

    env.data.item_ids = Array.prototype.concat.apply([], results);
  };
};
