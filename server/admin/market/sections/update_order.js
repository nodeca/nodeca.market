// Updates a parent and display order of section, also refreshes display orders of sibling sections.
//
// NOTE: This method is used for section/index page.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id:            { format: 'mongo',          required: true },
    parent:         { type: [ 'null', 'string' ], required: true },
    sibling_order:  { type: 'array',            required: false }
  });

  // set parent and display order to sections
  //
  N.wire.on(apiPath, async function section_update(env) {

    let section = await N.models.market.Section
                            .findById(env.params._id)
                            .select('parent display_order');

    section.parent = env.params.parent;
    await section.save();
  });


  // set display order to sibling sections
  //
  N.wire.after(apiPath, async function update_display_orders(env) {

    let _ids = env.params.sibling_order;

    // create hash table for _ids, where array index means display order
    let siblingOrder = {};

    _ids.forEach((value, index) => { siblingOrder[value] = index + 1; });

    let sections = await N.models.market.Section
                            .find({ _id: { $in: _ids } })
                            .select('display_order');

    // for each sibling find proper section and set `display_order` to it
    sections.forEach(section => { section.display_order = siblingOrder[section._id]; });

    await Promise.all(sections.map(section => section.save()));
  });
};
