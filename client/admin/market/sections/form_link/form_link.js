'use strict';


const _  = require('lodash');
const ko = require('knockout');


const SECTION_FIELD_DEFAULTS = {
  section: null,
  parent:  null
};


// Knockout bindings root object.
let view = null;


N.wire.on(module.apiPath + '.setup', function page_setup(data) {
  let currentLink = {};

  // Create observable fields on currentLink.
  for (let [ key, defaultValue ] of Object.entries(SECTION_FIELD_DEFAULTS)) {
    let value = Object.prototype.hasOwnProperty.call(data.current_section || {}, key) ?
                data.current_section[key] :
                defaultValue;

    currentLink[key] = ko.observable(value).extend({ dirty: true });
  }


  // Collect allowedParents list using tree order.
  // Prepand "– " string to title of each sections depending on nesting level.
  let allowedParents = [];

  // Prepend virtual Null-section to allowedParents list.
  // This is used instead of Knockout's optionsCaption because it does not
  // allow custom values - null in our case.
  allowedParents.push({ _id: null, title: t('value_section_none') });

  function fetchOtherSections(parent) {
    let sections = data.allowed_parents.filter(section => parent === (section.parent || null));

    _.sortBy(sections, 'display_order').forEach(section => {
      let prefix = '| ' + '– '.repeat(section.level);

      allowedParents.push({
        _id:   section._id,
        title: prefix + section.title
      });

      fetchOtherSections(section._id); // Fetch children sections.
    });
  }
  fetchOtherSections(null); // Fetch root sections.


  // Create and fill Knockout binding.
  view = {};

  view.currentLink = currentLink;
  view.allowedParents = allowedParents;

  // Check if any field values of currentLink were changed.
  view.isDirty = ko.computed(() => Object.values(currentLink).some(field => field.isDirty()));

  // Save new section.
  view.create = function create() {
    let request = {};

    for (let [ key, field ] of Object.entries(currentLink)) {
      request[key] = field();
    }

    N.io.rpc('admin.market.sections.create_link', request).then(() => {
      for (let field of Object.values(currentLink)) field.markClean();

      N.wire.emit('notify.info', t('message_created'));
      return N.wire.emit('navigate.to', { apiPath: 'admin.market.sections.index' });
    }).catch(err => N.wire.emit('error', err));
  };

  ko.applyBindings(view, $('#content')[0]);
});


N.wire.on(module.apiPath + '.teardown', function page_teardown() {
  view = null;
  ko.cleanNode($('#content')[0]);
});
