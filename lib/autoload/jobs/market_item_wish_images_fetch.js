// Fetch images from remote servers and get their size
//
'use strict';


const message_images_fetch = require('nodeca.core/lib/app/message_images_fetch');


module.exports = function (N) {
  N.wire.on('init:jobs', function register_market_item_wish_images_fetch() {
    message_images_fetch(N, {
      task_name: 'market_item_wish_images_fetch',
      rebuild:   id => N.wire.emit('internal:market.item_wish_rebuild', id)
                             .then(id => N.queue.market_item_wishes_search_update_by_ids([ id ]).postpone()),
      find:      id => N.models.market.ItemWish.findById(id)
    });
  });
};
