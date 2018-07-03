// Remove section link.
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section: { format: 'mongo', required: true },
    parent:  { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, async function link_destroy(env) {
    await N.models.market.Section.update(
             { _id: env.params.parent },
             { $pull: { links: env.params.section } }
           );
  });
};
