// Collect urls to include in sitemap
//

'use strict';

const stream   = require('stream');
const multi    = require('multistream');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function get_market_sitemap(data) {
    let sections = await N.models.market.Section.find().sort('hid').lean(true);

    let sections_by_id = {};

    for (let section of sections) sections_by_id[section._id] = section;

    let buffer = [];

    buffer.push({ loc: N.router.linkTo('market.index.buy', {}) });
    buffer.push({ loc: N.router.linkTo('market.index.wish', {}) });

    for (let section of sections) {
      buffer.push({
        loc: N.router.linkTo('market.section.buy', {
          section_hid: section.hid
        })
      });
    }

    for (let section of sections) {
      buffer.push({
        loc: N.router.linkTo('market.section.wish', {
          section_hid: section.hid
        })
      });
    }

    let section_stream = stream.Readable.from(buffer);

    let item_offers_stream = new stream.Transform({
      objectMode: true,
      transform(item, encoding, callback) {
        this.push({
          loc: N.router.linkTo('market.item.buy', {
            section_hid: sections_by_id[item.section].hid,
            item_hid: item.hid
          })
        });

        callback();
      }
    });

    stream.pipeline(
      N.models.market.ItemOffer.find()
          .where('st').equals(N.models.market.ItemOffer.statuses.OPEN)
          .select('section hid')
          .sort('hid')
          .lean(true)
          .stream(),

      item_offers_stream,
      () => {}
    );

    let item_wishes_stream = new stream.Transform({
      objectMode: true,
      transform(item, encoding, callback) {
        this.push({
          loc: N.router.linkTo('market.item.wish', {
            section_hid: sections_by_id[item.section].hid,
            item_hid: item.hid
          })
        });

        callback();
      }
    });

    stream.pipeline(
      N.models.market.ItemWish.find()
          .where('st').equals(N.models.market.ItemWish.statuses.OPEN)
          .select('section hid')
          .sort('hid')
          .lean(true)
          .stream(),

      item_wishes_stream,
      () => {}
    );

    data.streams.push({
      name: 'market',
      stream: multi.obj([ section_stream, item_offers_stream, item_wishes_stream ])
    });
  });
};
