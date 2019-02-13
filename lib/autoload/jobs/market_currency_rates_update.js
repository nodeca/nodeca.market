// Update currency exchange rates
//
'use strict';


const _                 = require('lodash');
const Queue             = require('idoit');
const docid_item_offers = require('nodeca.market/lib/search/docid_item_offers');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 50;
const ITEMS_PER_CHUNK  = 50;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_market_currency_rates_update() {
    const task_name = 'market_currency_rates_update';

    if (!N.config.cron || !N.config.cron[task_name]) {
      return new Error(`No config defined for cron task "${task_name}"`);
    }

    N.queue.registerTask({
      name: task_name,
      pool: 'hard',
      cron: N.config.cron[task_name],
      async process() {
        try {
          await N.models.market.CurrencyRate.fetch();
          await N.queue.market_currency_rates_rebuild().run();
        } catch (err) {
          // don't propagate errors because we don't need automatic reloading
          N.logger.error('"%s" job error: %s', task_name, err.message || err);
        }
      }
    });


    // Iterator
    //
    N.queue.registerTask({
      name: 'market_currency_rates_rebuild',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'market_currency_rates_rebuild',

      async iterate(state) {
        if (this.total === 0) return null;

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
                      .map(ids => N.queue.market_currency_rates_rebuild_chunk(ids));

        return {
          tasks: chunks,
          state: String(items[items.length - 1]._id)
        };
      },

      async init() {
        let query = N.models.market.ItemOffer.countDocuments();

        if (this.args.length < 1 || !this.args[0]) {
          // if no min _id
          let min_item = await N.models.market.ItemOffer.findOne()
                                  .select('_id')
                                  .sort('_id')
                                  .lean(true);

          if (!min_item) {
            this.total = 0;
            return;
          }

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

          if (!max_item) {
            this.total = 0;
            return;
          }

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
      name: 'market_currency_rates_rebuild_chunk',
      pool: 'hard',
      removeDelay: 3600,
      async process(ids) {
        let items = await N.models.market.ItemOffer.find()
                                .where('_id').in(ids)
                                .lean(true);

        if (!items.length) return;

        let currencies = _.uniq(items.map(i => i.price && i.price.currency).filter(Boolean));
        let currency_rates = {};

        for (let c of currencies) {
          currency_rates[c] = await N.models.market.CurrencyRate.get(c);
        }

        let new_prices = items.map(item => {
          return item.price.value * currency_rates[item.price.currency];
        });

        let bulk = N.models.market.ItemOffer.collection.initializeUnorderedBulkOp();

        for (let i = 0; i < items.length; i++) {
          let item = items[i];

          if (new_prices[i] === items[i].base_currency_price) continue;

          bulk.find({ _id: item._id }).update({ $set: { base_currency_price: new_prices[i] } });
        }

        if (bulk.length > 0) await bulk.execute();

        let queries = [];

        for (let i = 0; i < items.length; i++) {
          let item = items[i];

          if (new_prices[i] === items[i].base_currency_price) continue;

          queries.push([
            'UPDATE market_item_offers SET price=? WHERE id=?',
            [ new_prices[i], docid_item_offers(N, item.hid) ]
          ]);
        }

        if (queries.length > 0) await N.search.execute(queries);
      }
    });
  });
};
