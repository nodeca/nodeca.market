// Show page with full editable tree of market sections.
//
'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, async function sections_fetch(env) {
    env.data.sections = await N.models.market.Section.find()
                                  .sort('display_order')
                                  .lean(true);
  });


  N.wire.on(apiPath, function section_index(env) {
    function buildSectionsTree(parent) {
      let selectedSections = env.data.sections.filter(
        // Universal way for equal check on: Null, ObjectId, and String.
        section => String(section.parent || null) === String(parent));

      selectedSections.forEach(section => {
        // Recursively collect descendants.
        section.children = buildSectionsTree(section._id);
      });

      return selectedSections;
    }

    env.res.sections = buildSectionsTree(null);
  });

  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title');
  });
};
