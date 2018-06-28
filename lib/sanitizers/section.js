// Sanitize statuses and fields for sections
//
// - N
// - sections - array of models.market.Section. Could be plain value
// - user_info - Object with `usergroups` array and `hb`
// - callback - `function (err, res)`
//   - res - array of sanitized items. If `sections` is not array - will be plain sanitized section
//
'use strict';


const _ = require('lodash');


const fields = [
  '_id',
  'hid',
  'title',
  'parent',
  'links',
  'is_category',
  'level' // not in the model, added by N.models.market.Section.getChildren
];


module.exports = async function (N, sections/*, user_info*/) {
  let res;

  if (!Array.isArray(sections)) {
    res = [ sections ];
  } else {
    res = sections.slice();
  }

  res = res.map(item => _.pick(item, fields));

  if (Array.isArray(sections)) return res;

  return res[0];
};

module.exports.fields = fields;
