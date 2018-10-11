// Sanitize statuses and fields for itemss
//
// - N
// - items - array of models.market.ItemWish. Could be plain value
// - user_info - Object with `usergroups` array and `hb`
// - callback - `function (err, res)`
//   - res - array of sanitized items. If `items` is not array - will be plain sanitized item
//
'use strict';


const _ = require('lodash');


const fields = [
  '_id',
  'section',
  'title',
  'hid',
  'user',
  'ts',
  'md', // for editing
  'html',
  'location',
  'st',
  'ste',
  'edit_count',
  'last_edit_ts',
  'bookmarks',
  'views',
  'del_reason',
  'del_by'
];


module.exports = async function (N, items, user_info) {
  let res;

  if (!Array.isArray(items)) {
    res = [ items ];
  } else {
    res = items.slice();
  }

  res = res.map(item => _.pick(item, fields));

  let params = {
    user_id: user_info.user_id,
    usergroup_ids: user_info.usergroups
  };

  let can_see_hellbanned = await N.settings.get('can_see_hellbanned', params, {});

  res = res.map(item => {
    if (item.st === N.models.market.ItemWish.statuses.HB && !can_see_hellbanned) {
      item.st = item.ste;
      delete item.ste;
    }

    return item;
  });

  if (Array.isArray(items)) return res;

  return res[0];
};

module.exports.fields = fields;
