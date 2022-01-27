// Set displayed currency
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    currency: { type: 'string', required: true }
  });

  N.wire.on(apiPath, async function currency_select(env) {
    if (!N.config.market.currencies.hasOwnProperty(env.params.currency)) {
      throw N.io.BAD_REQUEST;
    }

    if (env.user_info.is_member) {
      await N.settings.getStore('user').set(
        { market_displayed_currency: { value: env.params.currency } },
        { user_id: env.user_info.user_id }
      );
    }

    // cookie is a backup storage for guests only
    env.extras.setCookie('currency', env.params.currency);
  });
};
