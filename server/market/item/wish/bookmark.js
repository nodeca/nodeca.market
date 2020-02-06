// Add/remove market item bookmark
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    item_id: { format: 'mongo', required: true },
    remove:  { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    env.data.item = await N.models.market.ItemWish
                              .findById(env.params.item_id)
                              .lean(true);

    if (!env.data.item) {
      env.data.item = await N.models.market.ItemWishArchived
                                .findById(env.params.item_id)
                                .lean(true);
    }

    if (!env.data.item) throw N.io.NOT_FOUND;
  });


  // Only allow to bookmark public posts
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      items: env.data.item,
      user_info: '000000000000000000000000' // guest
    } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    if (!access_env.data.access_read) {

      // Allow hellbanned users to bookmark their own posts
      //
      if (env.user_info.hb && env.data.item.st === N.models.market.ItemWish.statuses.HB) {
        let access_env = { params: {
          items: env.data.item,
          user_info: env.user_info
        } };

        await N.wire.emit('internal:market.access.item_wish', access_env);

        if (!access_env.data.access_read) {
          throw N.io.NOT_FOUND;
        }

        return;
      }

      throw N.io.NOT_FOUND;
    }
  });


  // Add/remove bookmark
  //
  N.wire.on(apiPath, async function bookmark_add_remove(env) {

    // If `env.params.remove` - remove bookmark
    if (env.params.remove) {
      await N.models.users.Bookmark.deleteOne({
        user: env.user_info.user_id,
        src:  env.data.item._id
      });
      return;
    }

    // Use `findOneAndUpdate` with `upsert` to avoid duplicates in case of multi click
    await N.models.users.Bookmark.findOneAndUpdate(
      {
        user: env.user_info.user_id,
        src:  env.data.item._id
      },
      { $set: {
        src_type: N.shared.content_type.MARKET_ITEM_WISH,
        public: true
      } },
      { upsert: true }
    );
  });


  // Update item, fill count
  //
  N.wire.after(apiPath, async function update_item(env) {
    let count = await N.models.users.Bookmark.countDocuments({ src: env.data.item._id });

    env.res.count = count;

    await N.models.market.ItemWish.updateOne(
      { _id: env.data.item._id },
      { bookmarks: count }
    );

    await N.models.market.ItemWishArchived.updateOne(
      { _id: env.data.item._id },
      { bookmarks: count }
    );
  });
};
