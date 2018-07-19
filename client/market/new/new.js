'use strict';

const _ = require('lodash');


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

  let draft_id;

  let rpc_cache = new RpcCache();

  view = {};

  view.offerTypes = [
    { title: t('offer_sell'), value: 'sell' },
    { title: t('offer_buy'),  value: 'buy' }
  ];

  view.currencyTypes = N.runtime.page_data.currency_types;

  view.router = N.router;

  view.offer = {
    type:           ko.observable(view.offerTypes[0].value),
    title:          ko.observable(''),
    price_value:    ko.observable(''),
    price_currency: ko.observable(view.currencyTypes[0].value),
    section:        ko.observable(''),
    description:    ko.observable(''),
    attachments:    ko.observableArray(),
    barter_info:    ko.observable(''),
    delivery:       ko.observable(false),
    is_new:         ko.observable(false)
  };


  if (N.runtime.page_data.selected_section_id) {
    view.offer.section(N.runtime.page_data.selected_section_id);
  }

  let savedDraft = _.pickBy(ko.toJS(view.offer), v => v !== '');

  if (N.runtime.page_data.draft) {
    draft_id = N.runtime.page_data.draft_id;

    for (let k of Object.keys(N.runtime.page_data.draft)) {
      if (N.runtime.page_data.draft[k] && view.offer[k]) {
        view.offer[k](N.runtime.page_data.draft[k]);
      }
    }
  }

  // force price to be numeric (better to do with extenders, but subscription is easier to do)
  view.offer.price_value.subscribe(v => {
    if (v) view.offer.price_value(Number(v));
  });

  view.showPreview  = ko.observable(false);
  view.previewHtml  = ko.observable('');
  view.isSubmitting = ko.observable(false);
  view.showErrors   = ko.observable(false);

  function saveDraft(force) {
    let object = _.pickBy(ko.toJS(view.offer), v => v !== '');

    if (JSON.stringify(savedDraft) === JSON.stringify(object) && !force) return;

    if (draft_id) {
      return N.io.rpc('market.new.draft.update', Object.assign({ draft_id }, object));
    }

    return N.io.rpc('market.new.draft.create', object)
        .then(res => {
          draft_id = res.draft_id;
          savedDraft = JSON.stringify(object);

          return N.wire.emit('navigate.replace', { href: N.router.linkTo('market.new', { draft_id }) });
        });
  }

  let saveDraftDebounced = _.debounce(() => {
    saveDraft().catch(() => { /* ignore */ });
  }, 2000, { leading: false, trailing: true, maxWait: 10000 });

  for (let k of Object.keys(view.offer)) {
    view.offer[k].subscribe(saveDraftDebounced);
  }

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

  function uploadFiles(files) {
    if (files.length === 0) return;

    let promise = Promise.resolve();

    if (!draft_id) {
      promise = promise.then(() => saveDraft(true));
    }

    promise = promise.then(() => {
      let params = {
        files,
        rpc: [ 'market.new.upload', { draft_id } ],
        config: 'users.uploader_config',
        uploaded: null
      };

      return N.wire.emit('users.uploader:add', params)
        .then(() => {
          params.uploaded.reverse().forEach(m => view.offer.attachments.push(m.media_id));
        });
    });

    promise.catch(err => N.wire.emit('error', err));
  }

  view.preview = function preview() {
    // true - switch to preview mode
    // false - switch back to editing
    let showPreview = !view.showPreview();

    view.showPreview(showPreview);

    if (showPreview) updatePreview();
  };

  rpc_cache.on('update', updatePreview);

  view.attachSetMain = function attach_set_main(a) {
    view.offer.attachments.remove(a);
    view.offer.attachments.unshift(a);
  };

  view.attachDelete = function attach_delete(a) {
    view.offer.attachments.remove(a);
  };

  //
  // Support for re-ordering attachments using drag and drop,
  // and uploading files when dropping them on attachment div
  //
  let dd_attach_id = null;

  view.attachDragStart = function attach_drag_start(attach) {
    dd_attach_id = attach;
    return true;
  };

  view.attachDragOver = function attach_drag_over(attach, jqEvent) {
    if (jqEvent.originalEvent.dataTransfer.types && jqEvent.originalEvent.dataTransfer.types[0] === 'Files') {
      jqEvent.originalEvent.dataTransfer.dropEffect = 'copy';
      return;
    }

    if (dd_attach_id) {
      jqEvent.originalEvent.dataTransfer.dropEffect = 'move';

      if (attach === dd_attach_id) return;

      let index_active = view.offer.attachments.indexOf(dd_attach_id);
      let index_target = view.offer.attachments.indexOf(attach);

      if (index_active === -1 || index_target === -1) return;

      if (index_active > index_target) {
        view.offer.attachments.remove(dd_attach_id);
        view.offer.attachments.splice(view.offer.attachments.indexOf(attach), 0, dd_attach_id);
      } else {
        view.offer.attachments.remove(dd_attach_id);
        view.offer.attachments.splice(view.offer.attachments.indexOf(attach) + 1, 0, dd_attach_id);
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
    if (jqEvent.originalEvent.dataTransfer.types && jqEvent.originalEvent.dataTransfer.types[0] === 'Files') {
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

    let params = _.pickBy(ko.toJS(view.offer));

    params.draft_id = draft_id;

    Promise.resolve()
      .then(() => N.io.rpc('market.new.create', params))
      .then(res => N.wire.emit('navigate.to', { apiPath: 'market.section', params: { section_hid: res.section_hid } }))
      .catch(err => {
        view.isSubmitting(false);
        N.wire.emit('error', err);
      });
  };

  ko.applyBindings(view, $('#market-new-form').get(0));

  //
  // Set up file upload
  //
  $('#market-new-upload').on('change', function () {
    uploadFiles($(this).get(0).files);
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
  const ko = require('knockout');

  ko.cleanNode($('#market-new-form').get(0));
  view = null;
});
