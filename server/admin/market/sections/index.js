// Show page with full editable tree of market sections.
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, async function sections_fetch(env) {
    env.data.sections = await N.models.market.Section.find()
                                  .sort('display_order')
                                  .lean(true);
  });


  N.wire.on(apiPath, function section_index(env) {
    let sections_by_id = _.keyBy(env.data.sections, '_id');

    function buildSectionsTree(parent) {
      let selectedSections = env.data.sections.filter(
        // Universal way for equal check on: Null, ObjectId, and String.
        section => String(section.parent || null) === String(parent));

      return selectedSections.map(section => {
        section = Object.assign({}, section);

        // Get linked sections
        let linked = (section.links || []).map(id => {
          let s = sections_by_id[id];
          if (!s) return;

          return Object.assign({}, s, { is_linked: true });
        }).filter(Boolean);

        // Recursively collect descendants.
        section.children = buildSectionsTree(section._id).concat(linked);

        return section;
      });
    }

    env.res.sections = buildSectionsTree(null);
  });

  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title');
  });
};
