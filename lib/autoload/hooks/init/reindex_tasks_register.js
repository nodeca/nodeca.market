// Add tasks to run during reindex
//

'use strict';


module.exports = function (N) {
  N.wire.on('internal:search.reindex.tasklist', function reindex_add_market_tasks(locals) {
    locals.push('market_item_offers_search_rebuild');
    locals.push('market_item_wishes_search_rebuild');
  });
};
