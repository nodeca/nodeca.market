// Generate sphinx docid for market items
//

'use strict';


module.exports = function search_docid_item_offer(N, item_hid) {
  return N.shared.content_type.MARKET_ITEM_OFFER * Math.pow(2, 47) + // 5 bit
         item_hid; // 47 bit
};
