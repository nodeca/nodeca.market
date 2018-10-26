// Tree of visible market sections (used in item move dialogs).
//
// - env.res.sections - out
//
'use strict';


module.exports = function (N, apiPath) {

  // Fetch sections
  //
  N.wire.before(apiPath, async function sections_fetch(env) {
    env.data.sections = await N.models.market.Section
                                  .find()
                                  .sort('display_order')
                                  .select('_id hid title parent is_category')
                                  .lean(true);
  });


  // Build sections tree
  //
  N.wire.on(apiPath, function build_tree(env) {
    function buildSectionsTree(parent) {
      let selectedSections = env.data.sections.filter(
        // Universal way for equal check on: Null, ObjectId, and String.
        section => String(section.parent || null) === String(parent)
      );

      selectedSections.forEach(section => {
        // Recursively collect descendants.
        section.children = buildSectionsTree(section._id);
      });

      return selectedSections;
    }

    env.res.sections = buildSectionsTree(null);
  });
};
