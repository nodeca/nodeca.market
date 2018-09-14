// Generate snippets for market items
//

'use strict';


const render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {

  N.wire.on('internal:common.embed.local', async function embed_item(data) {
    if (data.html) return;

    if (data.type !== 'inline') return;

    let match = N.router.matchAll(data.url).reduce((acc, match) => {
      if (match.meta.methods.get === 'market.item.buy') return match;
      return acc;
    }, null);

    if (!match) return;

    let item = await N.models.market.ItemOffer.findOne()
                         .where('hid').equals(match.params.item_hid)
                         .lean(true);
    if (!item) return;

    let section = await N.models.market.Section.findById(item.section)
                            .lean(true);

    // preserve inline link exactly as it was (keep hash tags, etc.)
    data.html = render(N, 'common.blocks.markup.market_item_buy_link', {
      href: data.url,
      item,
      section
    }, {});
  });


  N.wire.on('internal:common.embed.local', async function embed_item(data) {
    if (data.html) return;

    if (data.type !== 'inline') return;

    let match = N.router.matchAll(data.url).reduce((acc, match) => {
      if (match.meta.methods.get === 'market.item.wish') return match;
      return acc;
    }, null);

    if (!match) return;

    let item = await N.models.market.ItemWish.findOne()
                         .where('hid').equals(match.params.item_hid)
                         .lean(true);
    if (!item) return;

    let section = await N.models.market.Section.findById(item.section)
                            .lean(true);
    if (!section) return;

    // preserve inline link exactly as it was (keep hash tags, etc.)
    data.html = render(N, 'common.blocks.markup.market_item_wish_link', {
      href: data.url,
      item,
      section
    }, {});
  });
};
