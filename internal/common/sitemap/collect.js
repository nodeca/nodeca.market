// Collect urls to include in sitemap
//

'use strict';

const from2    = require('from2');
const multi    = require('multistream');
const pumpify  = require('pumpify');
const through2 = require('through2');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function get_market_sitemap(data) {
    let sections = await N.models.market.Section.find().sort('hid').lean(true);

    let sections_by_id = {};

    sections.forEach(section => { sections_by_id[section._id] = section; });

    let buffer = [];

    buffer.push({ loc: N.router.linkTo('market.index.sell', {}) });
    buffer.push({ loc: N.router.linkTo('market.index.buy', {}) });

    sections.forEach(section => {
      buffer.push({
        loc: N.router.linkTo('market.section.sell', {
          section_hid: section.hid
        })
      });
    });

    sections.forEach(section => {
      buffer.push({
        loc: N.router.linkTo('market.section.buy', {
          section_hid: section.hid
        })
      });
    });

    let item_offers_stream = pumpify.obj(
      N.models.market.ItemOffer.collection.find({
        st: N.models.market.ItemOffer.statuses.VISIBLE
      }, {
        section: 1,
        hid:     1
      }).sort({ hid: 1 }).stream(),

      through2.obj(function (item, encoding, callback) {
        this.push({
          loc: N.router.linkTo('market.item.sell', {
            section_hid: sections_by_id[item.section].hid,
            item_hid: item.hid
          })
        });

        callback();
      })
    );

    let item_requests_stream = pumpify.obj(
      N.models.market.ItemRequest.collection.find({
        st: N.models.market.ItemOffer.statuses.VISIBLE
      }, {
        section: 1,
        hid:     1
      }).sort({ hid: 1 }).stream(),

      through2.obj(function (item, encoding, callback) {
        this.push({
          loc: N.router.linkTo('market.item.buy', {
            section_hid: sections_by_id[item.section].hid,
            item_hid: item.hid
          })
        });

        callback();
      })
    );

    data.streams.push({
      name: 'market',
      stream: multi.obj([ from2.obj(buffer), item_offers_stream, item_requests_stream ])
    });
  });
};
