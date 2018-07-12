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
    draft_id = N.runtime.page_data.draft._id;

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

  let saveDraft = _.debounce(() => {
    let object = _.pickBy(ko.toJS(view.offer), v => v !== '');

    if (JSON.stringify(savedDraft) === JSON.stringify(object)) return;

    if (draft_id) {
      N.io.rpc('market.new.draft.update', Object.assign({ draft_id }, object))
        .catch(() => { /* ignore */ });
    } else {
      N.io.rpc('market.new.draft.create', object)
        .then(res => {
          draft_id = res.draft_id;
          savedDraft = JSON.stringify(object);

          return N.wire.emit('navigate.replace', { href: N.router.linkTo('market.new', { draft_id }) });
        })
        .catch(() => { /* ignore */ });
    }
  }, 2000, { leading: false, trailing: true, maxWait: 10000 });

  for (let k of Object.keys(view.offer)) {
    view.offer[k].subscribe(saveDraft);
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

  view.preview = function preview() {
    // true - switch to preview mode
    // false - switch back to editing
    let showPreview = !view.showPreview();

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

    let object = _.pickBy(ko.toJS(view.offer), v => v !== '');

    Promise.resolve()
      .then(() => N.io.rpc('market.new.create', object))
      .then(() => N.wire.emit('market.index'))
      .catch(err => N.wire.emit('error', err));
  };

  ko.applyBindings(view, $('#market-new-form').get(0));

  //
  // Set up file upload
  //
  $('#market-new-upload').on('change', function () {
    let files = $(this).get(0).files;

    if (files.length > 0) {
      let params = {
        files,
        rpc: [ 'market.new.upload', {} ],
        config: 'users.uploader_config',
        uploaded: null
      };

      N.wire.emit('users.uploader:add', params)
        .then(() => {
          params.uploaded.reverse().forEach(m => view.offer.attachments.unshift(m.media_id));
        })
        .catch(err => N.wire.emit('error', err));
    }
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
  const ko = require('knockout');

  ko.cleanNode($('#market-new-form').get(0));
  view = null;
});
