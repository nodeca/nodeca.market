// Renew all open items created by current user
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Don't renew if user doesn't have create permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let market_can_create_items = await env.extras.settings.fetch('market_can_create_items');
    if (!market_can_create_items) throw N.io.FORBIDDEN;
  });


  // Renew all offers
  //
  N.wire.on(apiPath, async function renew_offers(env) {
    let market_items_expire = await N.settings.get('market_items_expire');
    let autoclose_at_ts = new Date(Date.now() + market_items_expire * 24 * 60 * 60 * 1000);

    let items = await N.models.market.ItemOffer.find()
                          .where('user').equals(env.user_info.user_id)
                          .lean(true);

    await N.models.market.ItemOffer.updateMany(
      { _id: { $in: items.map(x => x._id) } },
      { $set: { autoclose_at_ts } }
    );

    //
    // save old versions in history
    //
    await N.models.market.ItemOfferHistory.add(
      items.map(item => ({
        old_item: item,
        new_item: { ...item, autoclose_at_ts }
      })),
      {
        user: env.user_info.user_id,
        role: N.models.market.ItemOfferHistory.roles.USER,
        ip:   env.req.ip
      }
    );
  });


  // Renew all wishes
  //
  N.wire.on(apiPath, async function renew_wishes(env) {
    let market_items_expire = await N.settings.get('market_items_expire');
    let autoclose_at_ts = new Date(Date.now() + market_items_expire * 24 * 60 * 60 * 1000);

    let items = await N.models.market.ItemWish.find()
                          .where('user').equals(env.user_info.user_id)
                          .lean(true);

    await N.models.market.ItemWish.updateMany(
      { _id: { $in: items.map(x => x._id) } },
      { $set: { autoclose_at_ts } }
    );

    //
    // save old versions in history
    //
    await N.models.market.ItemWishHistory.add(
      items.map(item => ({
        old_item: item,
        new_item: { ...item, autoclose_at_ts }
      })),
      {
        user: env.user_info.user_id,
        role: N.models.market.ItemWishHistory.roles.USER,
        ip:   env.req.ip
      }
    );
  });
};
