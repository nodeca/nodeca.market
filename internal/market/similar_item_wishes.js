// Get a list of similar items
//
// In:
//
//  - locals.item_id
//
// Out:
//
//  - locals.results (Array)
//     - item_id (ObjectId)
//     - weight  (Number)
//

'use strict';


const ObjectId      = require('mongoose').Types.ObjectId;
const sphinx_escape = require('nodeca.search').escape;

const DISPLAY_LIMIT = 3;


module.exports = function (N, apiPath) {

  // Check if results are already available from cache
  //
  N.wire.before(apiPath, async function fetch_cache(locals) {
    let cache = await N.models.market.ItemWishSimilarCache.findOne()
                          .where('item').equals(locals.item_id)
                          .lean(true);

    if (cache) {
      // don't use results older than a week
      let timediff = Date.now() - cache.ts.valueOf();

      if (timediff > 0 && timediff < 7 * 24 * 60 * 60 * 1000) {
        locals.results = cache.results;
        locals.cached  = true;
      }
    }
  });


  // Execute sphinxql query to find similar items
  //
  N.wire.on(apiPath, async function find_similar_items(locals) {
    if (locals.cached) return;

    let item = await N.models.market.ItemWish.findOne()
                         .where('_id').equals(locals.item_id)
                         .lean(true);

    if (!item) throw new Error("Similar items: can't find item with id=" + locals.item_id);

    // "sum(lcs*user_weight)*1000 + bm25" - formula for default ranking mode (SPH_RANK_PROXIMITY_BM25)
    //let ranker = '(sum(lcs*user_weight)*1000 + bm25)';
    let ranker = 'bm25';

    let results = await N.search.execute(
      `
        SELECT object_id, WEIGHT() as weight
        FROM market_item_wishes
        WHERE MATCH(?)
              AND public=1
              AND WEIGHT() > 0
        ORDER BY WEIGHT() DESC
        LIMIT ?
        OPTION ranker=expr(?)

      `.replace(/\n\s*/mg, ' '),

      // select +1 item to account for the fact that current item will likely be found in the index first
      [ '"' + sphinx_escape(item.title) + '"/1', DISPLAY_LIMIT + 1, ranker ]
    );

    locals.results = results.map(r => ({ item_id: new ObjectId(r.object_id), weight: r.weight }))
                            .filter(r => String(r.item_id) !== String(locals.item_id))
                            .slice(0, DISPLAY_LIMIT);
  });


  // Write results to cache
  //
  N.wire.after(apiPath, async function write_cache(locals) {
    if (locals.cached) return;

    await N.models.market.ItemWishSimilarCache.updateOne({
      item: locals.item_id
    }, {
      $set: {
        ts: new Date(),
        results: locals.results
      }
    }, { upsert: true });
  });
};
