// Create section link.
//
'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section: { format: 'mongo', required: true },
    parent:  { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, async function section_link_create(env) {
    await N.models.market.Section.updateOne(
             { _id: env.params.parent },
             { $push: { links: env.params.section } }
           );
  });
};
