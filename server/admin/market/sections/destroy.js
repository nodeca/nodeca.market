// Remove section from the database.
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, async function section_destroy(env) {
    let section = await N.models.market.Section.findById(env.params._id);

    // If section is already deleted or not exists - OK.
    if (!section) return;

    // Fail if there are any child sections.
    let anyChild = await N.models.market.Section.findOne({ parent: section._id });

    if (anyChild || (section.links || []).length > 0) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('error_section_has_children') };
    }

    // Fail if this section is linked anywhere.
    let anyLink = await N.models.market.Section.findOne({ links: section._id });

    if (anyLink) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('error_section_is_linked') };
    }

    // Fail if this section contains user posts.
    let anyPost =
      await N.models.market.ItemOffer.findOne({ section: section._id }) ||
      await N.models.market.ItemOfferArchived.findOne({ section: section._id }) ||
      await N.models.market.ItemWish.findOne({ section: section._id }) ||
      await N.models.market.ItemWishArchived.findOne({ section: section._id });

    if (anyPost) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('error_section_contains_posts') };
    }

    // All ok. Destroy section.
    await section.remove();
  });
};
