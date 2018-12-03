// Close and archive old items
//
'use strict';


const _        = require('lodash');
const ObjectId = require('mongoose').Types.ObjectId;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_market_item_wishes_archive() {
    const task_name = 'market_item_wishes_archive';

    if (!N.config.cron || !N.config.cron[task_name]) {
      return new Error(`No config defined for cron task "${task_name}"`);
    }

    N.queue.registerTask({
      name: task_name,
      pool: 'hard',
      cron: N.config.cron[task_name],
      async process() {
        let market_items_expire = await N.settings.get('market_items_expire');

        if (market_items_expire <= 0) return;

        let cutoff = Date.now() - market_items_expire * 24 * 60 * 60 * 1000;

        let docs = await N.models.market.ItemWish.find()
                             .where('_id').lt(new ObjectId(cutoff / 1000)).lean(true);

        if (!docs.length) return;

        let sections = new Set();
        let statuses = N.models.market.ItemWish.statuses;
        let bulk = N.models.market.ItemWishArchived.collection.initializeUnorderedBulkOp();

        for (let item of docs) {
          sections.add(item.section.toString());

          if (item.st === statuses.HB && item.ste === statuses.OPEN) {
            item.ste = statuses.CLOSED;
          } else if (item.st === statuses.OPEN) {
            item.st = statuses.CLOSED;
          }

          // update+upsert to avoid race condition if item was already archived
          bulk.find({ _id: item._id })
              .upsert()
              .update({ $set: item });
        }

        await bulk.execute();
        await N.models.market.ItemWish.remove({ _id: { $in: _.map(docs, '_id') } });

        for (let section_id of sections) {
          await N.models.market.Section.updateCache(section_id);
        }
      }
    });
  });
};
