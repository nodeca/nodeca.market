// Rebuild market items
//
'use strict';


const _        = require('lodash');
const Queue    = require('idoit');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 50;
const ITEMS_PER_CHUNK  = 50;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_market_item_offers_rebuild() {
    // Iterator
    //
    N.queue.registerTask({
      name: 'market_item_offers_rebuild',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'market_item_offers_rebuild',

      async iterate(state) {
        // Args are filled in by init; empty args means no posts were found
        if (!this.args[0] || !this.args[1]) return null;

        let active_chunks = this.children_created - this.children_finished;


        // Idle if we still have more than `CHUNKS_MIN_COUNT` chunks
        //
        if (active_chunks >= CHUNKS_MIN_COUNT) return {};


        // Fetch items _id
        //
        let query = N.models.market.ItemOffer.find()
                        .where('_id').gte(this.args[0]) // min
                        .select('_id')
                        .sort('-_id')
                        .limit(ITEMS_PER_CHUNK * CHUNKS_TO_ADD)
                        .lean(true);

        // If state is present it is always smaller than max _id
        if (state) {
          query.where('_id').lt(state);
        } else {
          query.where('_id').lte(this.args[1]); // max
        }

        let items = await query;


        // Check finished
        //
        if (!items.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(items.map(p => String(p._id)), ITEMS_PER_CHUNK)
                      .map(ids => N.queue.market_item_offers_rebuild_chunk(ids));

        return {
          tasks: chunks,
          state: String(items[items.length - 1]._id)
        };
      },

      async init() {
        let query = N.models.market.ItemOffer.count();

        if (this.args.length < 1 || !this.args[0]) {
          // if no min _id
          let min_item = await N.models.market.ItemOffer.findOne()
                                  .select('_id')
                                  .sort('_id')
                                  .lean(true);

          if (!min_item) return;

          this.args[0] = String(min_item._id);
        } else {
          // min _id already specified
          // (if it's not, we count all items without extra conditions,
          // which results in faster query)
          query = query.where('_id').gte(this.args[0]);
        }

        if (this.args.length < 2 || !this.args[1]) {
          // if no max _id
          let max_item = await N.models.market.ItemOffer.findOne()
                                   .select('_id')
                                   .sort('-_id')
                                   .lean(true);

          if (!max_item) return;

          this.args[1] = String(max_item._id);
        } else {
          // max _id already specified
          query = query.where('_id').lte(this.args[1]);
        }

        let item_count = await query;

        this.total = Math.ceil(item_count / ITEMS_PER_CHUNK);
      }
    });


    // Chunk
    //
    N.queue.registerTask({
      name: 'market_item_offers_rebuild_chunk',
      pool: 'hard',
      removeDelay: 3600,
      async process(ids) {
        let start_time = Date.now();

        N.logger.info(`Rebuilding items ${ids[0]}-${ids[ids.length - 1]} - ${ids.length} found`);

        await N.wire.emit('internal:market.item_offer_rebuild', ids);

        N.logger.info(`Rebuilding items ${ids[0]}-${ids[ids.length - 1]} - finished (${
          ((Date.now() - start_time) / 1000).toFixed(1)
          }s)`);
      }
    });
  });
};
