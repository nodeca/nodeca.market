// Create new section.
//
'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    parent:         { type: [ 'null', 'string' ], required: true },
    title:          { type: 'string',           required: true, minLength: 1 },
    is_category:    { type: 'boolean',          required: true },
    allow_offers:   { type: 'boolean',          required: true },
    allow_wishes:   { type: 'boolean',          required: true }
  });

  N.wire.on(apiPath, async function section_create(env) {
    let newSection = new N.models.market.Section(env.params);

    // Ensure parent section exists. (if provided)
    if (newSection.parent) {
      let parentSection = await N.models.market.Section
                                    .findById(newSection.parent)
                                    .select('_id')
                                    .lean(true);

      if (!parentSection) {
        throw { code: N.io.CLIENT_ERROR, message: env.t('error_parent_not_exists') };
      }
    }

    // Find and set first available `display_order` value in the end of siblings list.
    let result = await N.models.market.Section
                          .findOne({ parent: newSection.parent })
                          .select('display_order')
                          .sort('-display_order')
                          .limit(1)
                          .lean(true);

    newSection.display_order = (result?.display_order ?? 0) + 1;

    // Save new section into the database.
    await newSection.save();
  });
};
