// Tree of visible market sections,
// required to show section selection dialog in abuse reports
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true }
  });


  // Fill sections tree by subcall
  //
  N.wire.on(apiPath, async function fill_sections_tree(env) {
    env.data.section_item_type = 'wishes';
    await N.wire.emit('internal:market.sections_tree', env);
  });
};
