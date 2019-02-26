// When user creates a dialog, if it has market references, write them to db
//

'use strict';


module.exports = function (N) {
  N.wire.after('server:users.dialog.create', { priority: 20 }, async function add_dialog_ref_to_market_offers(env) {
    if (!env.params.meta) return;
    if (typeof env.params.meta.market_item_ref !== 'string') return;
    if (!env.params.meta.market_item_ref.match(/^[0-9a-f]{24}$/)) return;

    let item_id = env.params.meta.market_item_ref;
    let item = await N.models.market.ItemOffer.findById(item_id).lean(true);

    if (!item) return;

    // check if user can see this item
    let access_env = { params: {
      items: item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

    if (!access_env.data.access_read) return;

    let dialog = env.data.dialogs.filter(dlg => String(dlg.user) === String(item.user))[0];

    if (!dialog) return;

    let message = env.data.messages.filter(msg => String(msg.parent) === String(dialog._id))[0];

    if (!message) return;

    // write item<->dialog link into database,
    // replace existing reply from the same user to the same item if any
    await N.models.market.ItemDialogRef.findOneAndUpdate({
      item: item._id,
      message_author: env.user_info.user_id
    }, {
      $set: { message: message._id }
    }, { upsert: true });
  });


  N.wire.after('server:users.dialog.create', { priority: 20 }, async function add_dialog_ref_to_market_wishes(env) {
    if (!env.params.meta) return;
    if (typeof env.params.meta.market_item_ref !== 'string') return;
    if (!env.params.meta.market_item_ref.match(/^[0-9a-f]{24}$/)) return;

    let item_id = env.params.meta.market_item_ref;
    let item = await N.models.market.ItemWish.findById(item_id).lean(true);

    if (!item) return;

    // check if user can see this item
    let access_env = { params: {
      items: item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    if (!access_env.data.access_read) return;

    let dialog = env.data.dialogs.filter(dlg => String(dlg.user) === String(item.user))[0];

    if (!dialog) return;

    let message = env.data.messages.filter(msg => String(msg.parent) === String(dialog._id))[0];

    if (!message) return;

    // write item<->dialog link into database,
    // replace existing reply from the same user to the same item if any
    await N.models.market.ItemDialogRef.findOneAndUpdate({
      item: item._id,
      message_author: env.user_info.user_id
    }, {
      $set: { message: message._id }
    }, { upsert: true });
  });
};
