// Move item
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid_from: { type: 'integer', required: true },
    section_hid_to:   { type: 'integer', required: true },
    item_id:          { format: 'mongo', required: true }
  });


  N.wire.on(apiPath, function TODO() {
  });
};
