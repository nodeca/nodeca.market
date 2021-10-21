// Deliver `MARKET_NEW_WISH` notification
//
'use strict';


const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  // Notification will not be sent if target user:
  //
  // 1. creates this item himself
  // 2. no longer has access to this item
  // 3. ignores sender of this message
  //
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_market_item(local_env) {
    if (local_env.type !== 'MARKET_NEW_WISH') return;

    // Fetch item
    //
    let item = await N.models.market.ItemWish.findById(local_env.src).lean(true);
    if (!item) return;

    // Fetch section
    //
    let section = await N.models.market.Section.findById(item.section).lean(true);
    if (!section) return;

    let from_user_id = String(item.user);

    // Get list of subscribed users
    //
    let subscriptions = await N.models.users.Subscription.find()
                                  .where('to').equals(section._id)
                                  .where('type').equals(N.models.users.Subscription.types.WATCHING)
                                  // user subscribes separately to offers and wishes,
                                  // so for market sections we always have to check subscription type
                                  .where('to_type').equals(N.shared.content_type.MARKET_SECTION_WISH)
                                  .lean(true);

    if (!subscriptions.length) return;

    let user_ids = new Set(subscriptions.map(subscription => String(subscription.user)));

    // Apply ignores (list of users who already received this notification earlier)
    for (let user_id of local_env.ignore || []) user_ids.delete(user_id);

    // Fetch user info
    let users_info = await user_info(N, Array.from(user_ids));

    // 1. filter item owner (don't send notification to user who create this item)
    //
    user_ids.delete(from_user_id);

    // 2. filter users by access
    //
    for (let user_id of user_ids) {
      let access_env = { params: {
        items: item,
        user_info: users_info[user_id]
      } };

      await N.wire.emit('internal:market.access.item_wish', access_env);

      if (!access_env.data.access_read) user_ids.delete(user_id);
    }

    // 3. filter out ignored users
    //
    let ignore_data = await N.models.users.Ignore.find()
                                .where('from').in(Array.from(user_ids))
                                .where('to').equals(from_user_id)
                                .select('from to -_id')
                                .lean(true);

    for (let ignore of ignore_data) {
      user_ids.delete(String(ignore.from));
    }

    // Render messages
    //
    let general_project_name = await N.settings.get('general_project_name');

    for (let user_id of user_ids) {
      let locale = users_info[user_id].locale || N.config.locales[0];
      let helpers = {};

      helpers.t = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists = phrase => N.i18n.hasPhrase(locale, phrase);

      let subject = N.i18n.t(locale, 'users.notify.market_new_wish.subject', {
        project_name: general_project_name,
        section_title: section.title
      });

      let url = N.router.linkTo('market.item.wish', {
        section_hid: section.hid,
        item_hid: item.hid
      });

      let unsubscribe = N.router.linkTo('market.section.wish.unsubscribe', {
        section_hid: section.hid
      });

      let text = render(N, 'users.notify.market_new_wish',
        { title: item.title, html: item.html, link: url },
        helpers);

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    }
  });
};
