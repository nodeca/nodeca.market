
'use strict';


// Remove draft
//
N.wire.on(module.apiPath + ':remove', function remove_draft(data) {
  return N.io.rpc('market.new.draft.destroy', {
    draft_id: data.$this.data('draft-id')
  });
});
