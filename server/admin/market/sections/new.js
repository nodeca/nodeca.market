// Show create form for new section.
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // fetch sections tree
  //
  N.wire.before(apiPath, async function section_new(env) {
    let allSections = await N.models.market.Section.getChildren();

    // exclude links
    env.data.allowed_parents = allSections.filter(s => !s.is_linked);
  });


  // Prepare data
  //
  N.wire.on(apiPath, async function section_new(env) {
    let _ids = env.data.allowed_parents.map(s => s._id);

    let sections = await N.models.market.Section.find()
      .where('_id').in(_ids)
      .select('_id title')
      .lean(true);

    env.res.allowed_parents = [];

    // sort result in the same order as ids
    env.data.allowed_parents.forEach(allowedParent => {
      let foundSection = _.find(sections, section => section._id.equals(allowedParent._id));

      foundSection.level = allowedParent.level;
      env.res.allowed_parents.push(foundSection);
    });
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title');
  });
};
