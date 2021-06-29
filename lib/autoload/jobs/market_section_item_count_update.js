// Recalculate item counts in market section
//
'use strict';


const ObjectId = require('mongoose').Types.ObjectId;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_market_section_item_count_update() {
    N.queue.registerTask({
      name: 'market_section_item_count_update',
      pool: 'hard',

      // 15 minute delay by default
      postponeDelay: 15 * 60 * 1000,

      taskID: section_id => String(section_id),

      async process(section_str_id) {
        let section_id = new ObjectId(section_str_id);

        let offers_visible = await N.models.market.ItemOffer.countDocuments()
                                       .where('section').equals(section_id)
                                       .where('st').equals(N.models.market.ItemOffer.statuses.OPEN);

        let offers_hb = await N.models.market.ItemOffer.countDocuments()
                                  .where('section').equals(section_id)
                                  .where('st').equals(N.models.market.ItemOffer.statuses.HB);

        let wishes_visible = await N.models.market.ItemWish.countDocuments()
                                         .where('section').equals(section_id)
                                         .where('st').equals(N.models.market.ItemWish.statuses.OPEN);

        let wishes_hb = await N.models.market.ItemWish.countDocuments()
                                    .where('section').equals(section_id)
                                    .where('st').equals(N.models.market.ItemWish.statuses.HB);

        // Get item count in children sections
        let children_cnt = await N.models.market.Section
                                     .aggregate([
                                       { $match: { parent: section_id } }
                                     ])
                                     .group({
                                       _id: null,
                                       offer_count: { $sum: '$cache.offer_count' },
                                       offer_count_hb: { $sum: '$cache_hb.offer_count' },
                                       wish_count: { $sum: '$cache.wish_count' },
                                       wish_count_hb: { $sum: '$cache_hb.wish_count' }
                                     })
                                     .exec();

        children_cnt = children_cnt[0] || { offer_count: 0, offer_count_hb: 0, wish_count: 0, wish_count_hb: 0 };

        let update_data = {
          'cache.offer_count': offers_visible + children_cnt.offer_count,
          'cache_hb.offer_count': offers_visible + offers_hb + children_cnt.offer_count_hb,
          'cache.wish_count': wishes_visible + children_cnt.wish_count,
          'cache_hb.wish_count': wishes_visible + wishes_hb + children_cnt.wish_count_hb
        };

        let section = await N.models.market.Section.findOneAndUpdate({ _id: section_id }, { $set: update_data });

        if (section?.parent) {
          // Postpone parent count update
          N.queue.market_section_item_count_update(section.parent).postpone();
        }
      }
    });
  });
};
