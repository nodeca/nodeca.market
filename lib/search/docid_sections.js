// Generate sphinx docid for market sections
//

'use strict';


module.exports = function search_docid_section(N, section_hid) {
  return N.shared.content_type.MARKET_SECTION * Math.pow(2, 47) + // 5 bit
         section_hid; // 47 bit
};
