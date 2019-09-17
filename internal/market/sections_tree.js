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
                                  // select is used in place of sanitizer here
                                  .select('_id hid title parent is_category allow_offers allow_wishes')
                                  .lean(true);

    if (env.data.section_item_type === 'offers') {
      env.data.sections = env.data.sections.filter(s => s.allow_offers);
    } else if (env.data.section_item_type === 'wishes') {
      env.data.sections = env.data.sections.filter(s => s.allow_wishes);
    } else {
      env.data.sections = [];
    }
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
