// When user removes a bookmark from bookmark list, we need to
// update bookmark counters for the corresponding post
//

'use strict';


module.exports = function (N) {

  N.wire.after('server:users.bookmarks.destroy', async function update_market_offer_bookmark_counters(env) {
    if (!env.data.bookmark) return;
    if (env.data.bookmark.src_type !== N.shared.content_type.MARKET_ITEM_OFFER) return;

    let count = await N.models.users.Bookmark.countDocuments({ src: env.data.bookmark.src });

    await N.models.market.ItemOffer.updateOne(
      { _id: env.data.bookmark.src },
      { bookmarks: count }
    );

    await N.models.market.ItemOfferArchived.updateOne(
      { _id: env.data.bookmark.src },
      { bookmarks: count }
    );
  });

  N.wire.after('server:users.bookmarks.destroy', async function update_market_wish_bookmark_counters(env) {
    if (!env.data.bookmark) return;
    if (env.data.bookmark.src_type !== N.shared.content_type.MARKET_ITEM_WISH) return;

    let count = await N.models.users.Bookmark.countDocuments({ src: env.data.bookmark.src });

    await N.models.market.ItemWish.updateOne(
      { _id: env.data.bookmark.src },
      { bookmarks: count }
    );

    await N.models.market.ItemWishArchived.updateOne(
      { _id: env.data.bookmark.src },
      { bookmarks: count }
    );
  });
};
