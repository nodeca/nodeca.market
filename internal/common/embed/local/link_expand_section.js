// Replace link to market section with its title
//

'use strict';


const render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {

  N.wire.on('internal:common.embed.local', async function embed_market_section_buy(data) {
    if (data.html) return;

    if (data.type !== 'inline') return;

    let match = N.router.matchAll(data.url).reduce((acc, match) => {
      if (match.meta.methods.get === 'market.section.buy') return match;
      return acc;
    }, null);

    if (!match) return;

    let section = await N.models.market.Section.findOne()
                            .where('hid').equals(match.params.section_hid)
                            .lean(true);
    if (!section) return;

    data.html = render(N, 'common.blocks.markup.market_section_buy_link', {
      href:    data.url,
      section
    }, {});
  });


  N.wire.on('internal:common.embed.local', async function embed_market_section_wish(data) {
    if (data.html) return;

    if (data.type !== 'inline') return;

    let match = N.router.matchAll(data.url).reduce((acc, match) => {
      if (match.meta.methods.get === 'market.section.wish') return match;
      return acc;
    }, null);

    if (!match) return;

    let section = await N.models.market.Section.findOne()
                            .where('hid').equals(match.params.section_hid)
                            .lean(true);
    if (!section) return;

    data.html = render(N, 'common.blocks.markup.market_section_wish_link', {
      href:    data.url,
      section
    }, {});
  });
};
