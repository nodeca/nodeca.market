'use strict';


const _ = require('lodash');

require('jqtree');


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {

  $('.amarket-index__scontent').tree({
    data: N.runtime.page_data.sections,
    autoOpen: true,
    dragAndDrop: true,
    onCreateLi(section, $li) {
      $li
        .addClass('amarket-index__slist-item')
        .find('.jqtree-element')
        .html(N.runtime.render('admin.market.section.blocks.sections_tree_item', {
          section,
          users: N.runtime.page_data.users
        }));
    }
  }).on('tree.move', event => {
    // Wait next tick to ensure node update
    setTimeout(() => {
      let node = event.move_info.moved_node;

      let request = {
        _id: node._id,
        parent: node.parent._id || null,
        sibling_order: node.parent.children.map(child => child._id)
      };

      N.io.rpc('admin.market.section.update_order', request).catch(err => N.wire.emit('error', err));
    }, 0);
  });
});
