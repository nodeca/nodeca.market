// Add a tab on user activity page linking to the market
//

'use strict';


module.exports = function (N) {
  N.wire.after('server:users.activity', async function user_activity_add_market_link(env) {
    let counts = await Promise.all([
      N.models.market.UserItemOfferCount.get(env.data.user._id, env.user_info),
      N.models.market.UserItemOfferArchivedCount.get(env.data.user._id, env.user_info),
      N.models.market.UserItemWishCount.get(env.data.user._id, env.user_info),
      N.models.market.UserItemWishArchivedCount.get(env.data.user._id, env.user_info)
    ]);

    env.res.tabs.push({
      type: 'market',
      link: N.router.linkTo('market.user.buy_active', {
        user_hid: env.data.user.hid
      }),
      count: counts.reduce((a, b) => a + b, 0)
    });
  });
};
