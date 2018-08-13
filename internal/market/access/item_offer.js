// Check permissions to see market offer
//
// In:
//
// - params.items - array of models.market.ItemOffer. Could be plain value
// - params.user_info - user id or Object with `usergroups` array
// - params.preload - objects to preload in cache (unused)
// - data - cache + result
// - cache - object of `id => item`, only used internally
//
// Out:
//
// - data.access_read - array of boolean. If `params.items` is not array - will be plain boolean
//

'use strict';


const _        = require('lodash');
const ObjectId = require('mongoose').Types.ObjectId;
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', async function check_market_item_offer_access(access_env) {
    let match = N.router.matchAll(access_env.params.url).reduce(
      (acc, match) => (match.meta.methods.get === 'market.item.sell' ? match : acc),
      null
    );

    if (!match) return;

    let item = await N.models.market.ItemOffer.findOne()
                         .where('hid').equals(match.params.item_hid)
                         .lean(true);

    if (!item) return;

    let access_env_sub = {
      params: {
        items: item,
        user_info: access_env.params.user_info
      }
    };

    await N.wire.emit('internal:market.access.item_offer', access_env_sub);

    access_env.data.access_read = access_env_sub.data.access_read;
  });


  /////////////////////////////////////////////////////////////////////////////
  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    let items = Array.isArray(locals.params.items) ?
                locals.params.items :
                [ locals.params.items ];

    locals.data.item_ids = items.map(item => item._id);

    // fill in cache
    locals.cache = locals.cache || {};

    items.forEach(item => { locals.cache[item._id] = item; });

    (locals.params.preload || []).forEach(object => { locals.cache[object._id] = object; });

    // initialize access_read, remove items that's not found in cache
    locals.data.access_read = locals.data.item_ids.map(id => {
      if (!locals.cache[id]) return false;
      return null;
    });
  });


  // Fetch user user_info if it's not present already
  //
  N.wire.before(apiPath, async function fetch_usergroups(locals) {
    if (ObjectId.isValid(String(locals.params.user_info))) {
      locals.data.user_info = await userInfo(N, locals.params.user_info);
      return;
    }

    // Use presented
    locals.data.user_info = locals.params.user_info;
  });


  // Check market item permissions
  //
  N.wire.on(apiPath, async function check_item_access(locals) {
    let statuses = N.models.market.ItemOffer.statuses;
    let params = {
      user_id: locals.data.user_info.user_id,
      usergroup_ids: locals.data.user_info.usergroups
    };

    let setting_names = [
      'can_see_hellbanned'
    ];

    let settings = await N.settings.get(setting_names, params, {});

    locals.data.item_ids.forEach((id, i) => {
      if (locals.data.access_read[i] === false) return; // continue

      let item = locals.cache[id];

      let visibleSt = [ statuses.VISIBLE ];

      if (locals.data.user_info.hb || settings.can_see_hellbanned) {
        visibleSt.push(statuses.HB);
      }

      if (visibleSt.indexOf(item.st) === -1) {
        locals.data.access_read[i] = false;
      }
    });
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(locals) {
    locals.data.access_read = locals.data.access_read.map(val => val !== false);

    // If `params.items` is not array - `data.access_read` should be also not an array
    if (!_.isArray(locals.params.items)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
