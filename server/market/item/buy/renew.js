// Renew item (reset autoclose time)
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    item_id: { format: 'mongo', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    let item = await N.models.market.ItemOffer
                              .findById(env.params.item_id)
                              .lean(true);

    if (!item) throw N.io.NOT_FOUND;

    env.data.item = item;
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


  // Check permissions as owner
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let market_can_create_items = await env.extras.settings.fetch('market_can_create_items');

    if ((env.user_info.user_id !== String(env.data.item.user)) || !market_can_create_items) {
      throw N.io.FORBIDDEN;
    }
  });


  // Renew item
  //
  N.wire.on(apiPath, async function renew_item(env) {
    let market_items_expire = await N.settings.get('market_items_expire');
    let autoclose_at_ts = new Date(Date.now() + market_items_expire * 24 * 60 * 60 * 1000);

    if (Math.abs(env.data.item.autoclose_at_ts - autoclose_at_ts) < 24 * 60 * 60 * 1000) return;

    let update = { autoclose_at_ts };

    await N.models.market.ItemOffer.updateOne({ _id: env.data.item._id }, update);

    let new_item = Object.assign({}, env.data.item, update);
    env.data.new_item = new_item;
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    if (!env.data.new_item) return;

    return N.models.market.ItemOfferHistory.add(
      {
        old_item: env.data.item,
        new_item: env.data.new_item
      },
      {
        user: env.user_info.user_id,
        role: N.models.market.ItemOfferHistory.roles.USER,
        ip:   env.req.ip
      }
    );
  });
};
