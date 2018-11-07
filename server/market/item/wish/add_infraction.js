// Add infraction to user
//
'use strict';


const _        = require('lodash');
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    item_id:  { format: 'mongo', required: true },
    type:     { type: 'string',  required: true },
    expire:   { type: 'integer', required: true },
    points:   { type: 'integer', required: true },
    reason:   { type: 'string' }
  });


  // Additional type validation
  //
  N.wire.before(apiPath, function validate_type(env) {
    let types = _.get(N.config, 'users.infractions.types', {});

    if (env.params.type === 'custom') {
      if (!env.params.reason) throw N.io.BAD_REQUEST;
    } else if (!types[env.params.type]) throw N.io.BAD_REQUEST;
  });


  // Check is member
  //
  N.wire.before(apiPath, function check_is_member(env) {
    if (!env.user_info.is_member) throw N.io.NOT_FOUND;
  });


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    env.data.item = await N.models.market.ItemWish.findById(env.params.item_id)
                               .lean(true);

    if (!env.data.item) {
      env.data.item = await N.models.market.ItemWishArchived.findById(env.params.item_id)
                                 .lean(true);
    }

    if (!env.data.item) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let market_mod_can_add_infractions = await env.extras.settings.fetch('market_mod_can_add_infractions');

    if (!market_mod_can_add_infractions) throw N.io.FORBIDDEN;

    let user_info = await userInfo(N, env.data.item.user);
    let params = {
      user_id: user_info.user_id,
      usergroup_ids: user_info.usergroups
    };
    let cannot_receive_infractions = await N.settings.get('cannot_receive_infractions', params, {});

    if (cannot_receive_infractions) throw { code: N.io.CLIENT_ERROR, message: env.t('err_perm_receive') };
  });


  // Check whether infraction already exists
  //
  N.wire.before(apiPath, async function check_exists(env) {
    let infraction = await N.models.users.Infraction.findOne()
                               .where('src').equals(env.data.item._id)
                               .where('exists').equals(true)
                               .lean(true);

    if (infraction) throw { code: N.io.CLIENT_ERROR, message: env.t('err_infraction_exists') };
  });


  // Save infraction
  //
  N.wire.on(apiPath, async function add_infraction(env) {
    let reason = env.params.reason;

    if (env.params.type !== 'custom') {
      // Save fallback data (if infraction type deleted from config)
      reason = env.t(`@users.infractions.types.${env.params.type}`);
    }

    let infraction = new N.models.users.Infraction({
      from: env.user_info.user_id,
      'for': env.data.item.user,
      type: env.params.type,
      reason,
      points: env.params.points,
      src: env.data.item._id,
      src_type: N.shared.content_type.MARKET_ITEM_WISH
    });

    if (env.params.expire > 0) {
      // Expire in days
      infraction.expire = new Date(Date.now() + (env.params.expire * 24 * 60 * 60 * 1000));
    }

    await infraction.save();
  });
};
