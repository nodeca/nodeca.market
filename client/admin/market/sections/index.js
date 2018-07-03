'use strict';


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
        .html(N.runtime.render('admin.market.sections.blocks.sections_tree_item', {
          section,
          users: N.runtime.page_data.users
        }));
    }
  }).on('tree.move', event => {
    let node = event.move_info.moved_node;

    if (node.is_linked && !event.move_info.target_node.parent._id) {
      event.preventDefault();
      N.wire.emit('notify', t('error_link_must_have_parent'));
      return;
    }

    // Wait next tick to ensure node update
    setTimeout(() => {
      if (node.is_linked) {
        let request = {
          _id: node._id,
          parent: node.parent._id || null,
          previous_parent: event.move_info.previous_parent._id || null,
          sibling_order: node.parent.children.filter(child => child.is_linked).map(child => child._id)
        };

        N.io.rpc('admin.market.sections.update_link_order', request).catch(err => N.wire.emit('error', err));
      } else {
        let request = {
          _id: node._id,
          parent: node.parent._id || null,
          sibling_order: node.parent.children.filter(child => !child.is_linked).map(child => child._id)
        };

        N.io.rpc('admin.market.sections.update_order', request).catch(err => N.wire.emit('error', err));
      }
    }, 0);
  });
});


N.wire.before('admin.market.sections.destroy_section', function confirm_section_destroy(data) {
  return N.wire.emit(
    'admin.core.blocks.confirm',
    t('message_confirm_section_delete', { title: data.$this.data('title') })
  );
});


N.wire.on('admin.market.sections.destroy_section', function section_destroy(data) {
  let $container = data.$this.closest('.amarket-index__slist-item');

  return N.io.rpc('admin.market.sections.destroy', { _id: data.$this.data('id') })
    .then(() => {
      // Remove all destroyed elements from DOM.
      $container.prev('._placeholder').remove();
      $container.remove();
    })
    .catch(err => N.wire.emit('notify', err.message));
});


N.wire.before('admin.market.sections.destroy_link', function confirm_link_destroy(data) {
  return N.wire.emit(
    'admin.core.blocks.confirm',
    t('message_confirm_link_delete', { title: data.$this.data('title') })
  );
});


N.wire.on('admin.market.sections.destroy_link', function link_destroy(data) {
  let $container = data.$this.closest('.amarket-index__slist-item');

  return N.io.rpc('admin.market.sections.destroy_link', {
    section: data.$this.data('id'),
    parent: data.$this.data('parent')
  })
    .then(() => {
      // Remove all destroyed elements from DOM.
      $container.prev('._placeholder').remove();
      $container.remove();
    })
    .catch(err => N.wire.emit('notify', err.message));
});
