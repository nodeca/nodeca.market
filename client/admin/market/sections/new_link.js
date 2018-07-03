'use strict';


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  return N.wire.emit('admin.market.sections.form_link.setup', N.runtime.page_data);
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown() {
  return N.wire.emit('admin.market.sections.form_link.teardown', null);
});
