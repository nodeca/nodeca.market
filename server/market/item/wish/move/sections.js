// Tree of visible market sections
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let market_mod_can_move_items = await env.extras.settings.fetch('market_mod_can_move_items');

    if (!market_mod_can_move_items) throw N.io.FORBIDDEN;
  });


  // Fill sections tree by subcall
  //
  N.wire.on(apiPath, async function fill_sections_tree(env) {
    await N.wire.emit('internal:market.sections_tree', env);
  });
};
