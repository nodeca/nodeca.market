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

  view.router = N.router;

  view.offer = {
    title:          ko.observable(item.title),
    section:        ko.observable(item.section),
    description:    ko.observable(item.md)
  };

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
      attachments: [],
      options: N.runtime.page_data.parse_options,
      rpc_cache
    })
      .then(result => {
        view.previewHtml(result.html);
      })
      // It should never happen
      .catch(err => N.wire.emit('notify', err.message));
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

  view.submit = function submit(form) {
    if (form.checkValidity() === false) {
      view.showErrors(true);
      return;
    }

    view.showErrors(false);
    view.isSubmitting(true);

    let params = {
      item_id:        item._id,
      title:          view.offer.title(),
      section:        view.offer.section(),
      description:    view.offer.description()
    };

    Promise.resolve()
      .then(() => N.io.rpc('market.item.wish.edit.update', params))
      .then(res => N.wire.emit('navigate.to', res.redirect_url))
      .catch(err => {
        view.isSubmitting(false);
        N.wire.emit('error', err);
      });
  };

  ko.applyBindings(view, $('#market-edit-form').get(0));
});


N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
  const ko = require('knockout');

  ko.cleanNode($('#market-edit-form').get(0));
  view = null;
});
