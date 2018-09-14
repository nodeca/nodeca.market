// Check permissions to see section
//
// Currently a stub that allows the access to everyone
//

'use strict';


module.exports = function (N/*, apiPath*/) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', async function check_market_section_access(access_env) {
    let match = N.router.matchAll(access_env.params.url).reduce(
      (acc, match) => (
        (
          match.meta.methods.get === 'market.section.buy' ||
          match.meta.methods.get === 'market.section.wish'
        ) ? match : acc
      ),
      null
    );

    if (!match) return;

    let section = await N.models.market.Section.findOne()
                            .where('hid').equals(match.params.section_hid)
                            .lean(true);

    if (!section) return;

    access_env.data.access_read = true;
  });
};
