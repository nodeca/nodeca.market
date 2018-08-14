// Stop market rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function market_items_rebuild_stop() {
    return N.queue.cancel('market_items_rebuild');
  });
};
