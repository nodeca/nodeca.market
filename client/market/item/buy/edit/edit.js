'use strict';


// Knockout bindings root object.
let view = null;


N.wire.on('navigate.preload:' + module.apiPath, function load_deps(preload) {
  preload.push('vendor.knockout');

  // editor itself is not used, only markdown parser and mdedit cache
  preload.push('mdedit');
});


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  const RpcCache = require('nodeca.core/client/mdedit/_lib/rpc_cache')(N);
  const ko = require('knockout');

  let item = N.runtime.page_data.item;

  let rpc_cache = new RpcCache();

  view = {};

  view.currencyTypes = N.runtime.page_data.currency_types.map(id => ({
    title: t.exists('@market.currencies.' + id + '.sign') ? t('@market.currencies.' + id + '.sign') : id,
    value: id
  }));

  view.router = N.router;

  view.offer = {
    title:          ko.observable(item.title || ''),
    price_value:    ko.observable(item.price.value || ''),
    price_currency: ko.observable(item.price.currency || ''),
    section:        ko.observable(item.section || ''),
    description:    ko.observable(item.md || ''),
    files:          ko.observableArray(item.files.map(id => ({ id }))),
    barter_info:    ko.observable(item.barter_info || ''),
    delivery:       ko.observable(item.delivery || false),
    is_new:         ko.observable(item.is_new || false)
  };

  // force price to be numeric (better to do with extenders, but subscription is easier to do)
  view.offer.price_value.subscribe(v => {
    if (v) view.offer.price_value(Number(v));
  });

  view.showPreview  = ko.observable(false);
  view.previewHtml  = ko.observable('');
  view.isSubmitting = ko.observable(false);
  view.showErrors   = ko.observable(false);

  let initialState = ko.observable();

  view.isDirty = ko.computed({
    read() {
      return initialState() !== ko.toJSON(view.offer);
    },
    write(value) {
      initialState(value ? null : ko.toJSON(view.offer));
    }
  });

  view.isDirty(false);

  function updatePreview() {
    N.parser.md2html({
      text: view.offer.description(),
      options: N.runtime.page_data.parse_options,
      rpc_cache
    })
      .then(result => {
        view.previewHtml(result.html);
      })
      // It should never happen
      .catch(err => N.wire.emit('notify', err.message));
  }

  function uploadFiles(files) {
    if (files.length === 0) return;

    let promise = Promise.resolve();

    promise = promise.then(() => {
      let params = {
        files,
        rpc: [ 'market.item.buy.edit.upload', { item_id: item._id } ],
        config: 'users.uploader_config',
        uploaded: null
      };

      return N.wire.emit('users.uploader:add', params)
        .then(() => {
          params.uploaded.reverse().forEach(m => view.offer.files.push({ id: m.media_id, tmp: true }));
        });
    });

    promise.catch(err => N.wire.emit('error', err));
  }

  // true - switch to preview mode
  // false - switch back to editing
  // null - toggle mode
  view.togglePreview = function preview(mode) {
    let showPreview = typeof mode === 'boolean' ? mode : !view.showPreview();

    view.showPreview(showPreview);

    if (showPreview) updatePreview();
  };

  rpc_cache.on('update', updatePreview);

  view.attachSetMain = function attach_set_main(a) {
    view.offer.files.remove(a);
    view.offer.files.unshift(a);
  };

  view.attachDelete = function attach_delete(a) {
    view.offer.files.remove(a);
  };

  //
  // Support for re-ordering files using drag and drop,
  // and uploading files when dropping them on attachment div
  //
  let dd_attach_id = null;

  view.attachDragStart = function attach_drag_start(attach) {
    dd_attach_id = attach;
    return true;
  };

  view.attachDragOver = function attach_drag_over(attach, jqEvent) {
    if (jqEvent.originalEvent.dataTransfer.types?.[0] === 'Files') {
      jqEvent.originalEvent.dataTransfer.dropEffect = 'copy';
      return;
    }

    if (dd_attach_id) {
      jqEvent.originalEvent.dataTransfer.dropEffect = 'move';

      if (attach === dd_attach_id) return;

      let index_active = view.offer.files.indexOf(dd_attach_id);
      let index_target = view.offer.files.indexOf(attach);

      if (index_active === -1 || index_target === -1) return;

      if (index_active > index_target) {
        view.offer.files.remove(dd_attach_id);
        view.offer.files.splice(view.offer.files.indexOf(attach), 0, dd_attach_id);
      } else {
        view.offer.files.remove(dd_attach_id);
        view.offer.files.splice(view.offer.files.indexOf(attach) + 1, 0, dd_attach_id);
      }

      return;
    }
  };

  view.attachDrop = function attach_drop(__, jqEvent) {
    dd_attach_id = null;

    if (jqEvent.originalEvent.dataTransfer.files) {
      uploadFiles(jqEvent.originalEvent.dataTransfer.files);
    }
  };

  view.plusDragOver = function file_drag_over(__, jqEvent) {
    if (jqEvent.originalEvent.dataTransfer.types?.[0] === 'Files') {
      jqEvent.originalEvent.dataTransfer.dropEffect = 'copy';
    }
  };

  view.plusDrop = function file_drop(attach, jqEvent) {
    if (jqEvent.originalEvent.dataTransfer.files) {
      uploadFiles(jqEvent.originalEvent.dataTransfer.files);
    }
  };

  view.submit = function submit(form) {
    if (form.checkValidity() === false) {
      view.showErrors(true);
      return;
    }

    view.showErrors(false);
    view.isSubmitting(true);

    let canEditAsUser = N.runtime.is_member &&
                        item.user === N.runtime.user_id &&
                        N.runtime.page_data.settings.market_can_create_items;

    let params = {
      item_id:        item._id,
      title:          view.offer.title(),
      price_value:    view.offer.price_value(),
      price_currency: view.offer.price_currency(),
      section:        view.offer.section(),
      description:    view.offer.description(),
      files:          view.offer.files().map(x => x.id),
      barter_info:    view.offer.barter_info(),
      delivery:       view.offer.delivery(),
      is_new:         view.offer.is_new(),
      as_moderator:   !canEditAsUser
    };

    Promise.resolve()
      .then(() => N.io.rpc('market.item.buy.edit.update', params))
      .then(res => N.wire.emit('navigate.to', res.redirect_url))
      .catch(err => {
        view.isSubmitting(false);
        N.wire.emit('error', err);
      });
  };

  ko.applyBindings(view, $('#market-edit-form').get(0));

  //
  // Set up file upload
  //
  $('#market-upload').on('change', function () {
    let files = Array.prototype.slice.call($(this).get(0).files); // clone filelist

    // reset input, so uploading the same file again will trigger 'change' event
    $(this).val('');

    uploadFiles(files);
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
  const ko = require('knockout');

  ko.cleanNode($('#market-edit-form').get(0));
  view = null;
});
