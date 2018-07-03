// Updates a parent and display order for section links.
//
// NOTE: This method is used for section/index page.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id:             { format: 'mongo', required: true },
    parent:          { format: 'mongo', required: true },
    previous_parent: { format: 'mongo', required: true },
    sibling_order:   { type: 'array',   required: false }
  });

  // Remove old link
  //
  N.wire.on(apiPath, function remove_old_link(env) {
    return N.models.market.Section.update(
             { _id: env.params.previous_parent },
             { $pull: { links: env.params._id } }
           );
  });


  // Create link under new section
  //
  N.wire.on(apiPath, async function create_link(env) {
    let section = await N.models.market.Section.findById(env.params.parent);

    if (!section) return;

    section.links = env.params.sibling_order;

    await section.save();
  });
};
