// Fill urls and titles for market items (`MARKET_ITEM_OFFER`, `MARKET_ITEM_WISH`)
//
// In:
//
// - infractions ([users.Infraction])
// - user_info (Object)
//
// Out:
//
// - info (Object) - key is `src`, value { url, title, text }
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  // Fetch infractions issued for market item offers
  //
  N.wire.on(apiPath, async function market_item_offers_fetch_infraction_info(info_env) {
    let item_ids = _.map(info_env.infractions.filter(
                          i => i.src_type === N.shared.content_type.MARKET_ITEM_OFFER
                        ), 'src');

    if (!item_ids.length) return;


    // Fetch items
    //
    let items = await N.models.market.ItemOffer.find()
                            .where('_id').in(item_ids)
                            .lean(true);

    // Fetch sections
    //
    let sections = await N.models.market.Section.find()
                             .where('_id').in(_.map(items, 'section'))
                             .lean(true);

    let access_env = { params: {
      items,
      user_info: info_env.user_info
    } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

    items = items.filter((__, idx) => access_env.data.access_read[idx]);

    let sections_by_id = _.keyBy(sections, '_id');

    items.forEach(item => {
      let section = sections_by_id[item.section];
      if (!section) return;

      info_env.info[item._id] = {
        title: item.title,
        url: N.router.linkTo('market.item.buy', {
          section_hid: section.hid,
          item_hid:    item.hid
        }),
        text: item.md
      };
    });
  });


  // Fetch infractions issued for market item wishes
  //
  N.wire.on(apiPath, async function market_item_wishes_fetch_infraction_info(info_env) {
    let item_ids = _.map(info_env.infractions.filter(
                          i => i.src_type === N.shared.content_type.MARKET_ITEM_WISH
                        ), 'src');
    if (!item_ids.length) return;


    // Fetch items
    //
    let items = await N.models.market.ItemWish.find()
                            .where('_id').in(item_ids)
                            .lean(true);

    // Fetch sections
    //
    let sections = await N.models.market.Section.find()
                             .where('_id').in(_.map(items, 'section'))
                             .lean(true);

    let access_env = { params: {
      items,
      user_info: info_env.user_info
    } };

    await N.wire.emit('internal:market.access.item_wish', access_env);

    items = items.filter((__, idx) => access_env.data.access_read[idx]);

    let sections_by_id = _.keyBy(sections, '_id');

    items.forEach(item => {
      let section = sections_by_id[item.section];
      if (!section) return;

      info_env.info[item._id] = {
        title: item.title,
        url: N.router.linkTo('market.item.wish', {
          section_hid: section.hid,
          item_hid:    item.hid
        }),
        text: item.md
      };
    });
  });
};
