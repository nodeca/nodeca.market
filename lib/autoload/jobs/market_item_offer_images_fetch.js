// Fetch images from remote servers and get their size
//
'use strict';


const message_images_fetch = require('nodeca.core/lib/app/message_images_fetch');


module.exports = function (N) {
  N.wire.on('init:jobs', function register_market_item_offer_images_fetch() {
    message_images_fetch(N, {
      task_name: 'market_item_offer_images_fetch',
      rebuild:   id => N.wire.emit('internal:market.item_offer_rebuild', id)
                             .then(id => N.queue.market_item_offers_search_update_by_ids([ id ]).postpone()),
      find:      id => N.models.market.ItemOffer.findById(id)
    });
  });
};
