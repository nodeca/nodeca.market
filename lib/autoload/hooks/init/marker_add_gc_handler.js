// Add gc handler to `N.models.users.Marker`
//
'use strict';


const ObjectId            = require('mongoose').Types.ObjectId;
const userInfo            = require('nodeca.users/lib/user_info');
const sanitize_item_offer = require('nodeca.market/lib/sanitizers/item_offer');
const sanitize_item_wish  = require('nodeca.market/lib/sanitizers/item_wish');


module.exports = function (N) {

  async function market_item_offer_gc_handler(userId, categoryId, currentCut) {
    // Fetch user_info
    //
    let user_info = await userInfo(N, userId);

    // Fetch items
    //
    let query = N.models.market.ItemOffer.find()
                    .where('section').equals(categoryId.replace('_offers', ''))
                    .where('_id').gt(new ObjectId(Math.round(currentCut / 1000)));

    let items = await query.lean(true);

    // Check access
    //
    let access_env = { params: { items, user_info } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

    items = items.filter((__, i) => access_env.data.access_read[i]);

    // Sanitize
    //
    items = await sanitize_item_offer(N, items, user_info);


    return items.map(item => ({
      categoryId: item.section,
      contentId: item._id,
      lastPostNumber: 1,
      lastPostTs: item.ts
    }));
  }


  async function market_item_wish_gc_handler(userId, categoryId, currentCut) {
    // Fetch user_info
    //
    let user_info = await userInfo(N, userId);

    // Fetch items
    //
    let query = N.models.market.ItemWish.find()
                    .where('section').equals(categoryId.replace('_wishes', ''))
                    .where('_id').gt(new ObjectId(Math.round(currentCut / 1000)));

    let items = await query.lean(true);

    // Check access
    //
    let access_env = { params: { items, user_info } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    items = items.filter((__, i) => access_env.data.access_read[i]);

    // Sanitize
    //
    items = await sanitize_item_wish(N, items, user_info);


    return items.map(item => ({
      categoryId: item.section,
      contentId: item._id,
      lastPostNumber: 1,
      lastPostTs: item.ts
    }));
  }


  N.wire.after('init:models', { priority: 50 }, function marker_add_gc_handler() {
    N.models.users.Marker.registerGc('market_item_offer', market_item_offer_gc_handler);
    N.models.users.Marker.registerGc('market_item_wish',  market_item_wish_gc_handler);
  });
};
