'use strict';


N.wire.on('users.tracker.market_item:mark_tab_read', function mark_tab_read() {
  return N.io.rpc('market.mark_read', { ts: N.runtime.page_data.mark_cut_ts })
             .then(() => N.wire.emit('navigate.reload'));
});
