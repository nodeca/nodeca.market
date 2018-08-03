'use strict';


module.exports.up = async function (N) {
  let usergroupStore = N.settings.getStore('usergroup');

  // add usergroup settings for admin

  let adminGroupId = await N.models.users.UserGroup.findIdByName('administrators');

  await usergroupStore.set({
    market_can_create_items:        { value: true },
    market_mod_can_add_infractions: { value: true }
  }, { usergroup_id: adminGroupId });

  // add usergroup settings for members

  let memberGroupId = await N.models.users.UserGroup.findIdByName('members');

  await usergroupStore.set({
    market_can_create_items:        { value: true }
  }, { usergroup_id: memberGroupId });

  // add usergroup settings for violators
  //
  // note: it is a modifier group added to users in addition to their
  //       existing usergroups, thus we should turn "force" flag on

  let violatorsGroupId = await N.models.users.UserGroup.findIdByName('violators');

  await usergroupStore.set({
    market_can_create_items:        { value: false, force: true }
  }, { usergroup_id: violatorsGroupId });
};
