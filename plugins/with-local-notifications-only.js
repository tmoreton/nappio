const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Nappio schedules local interruption alerts and never registers for APNs.
 * expo-notifications enables the push entitlement by default, so remove that
 * entitlement after its plugin runs to keep the provisioning profile minimal.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (configWithEntitlements) => {
    delete configWithEntitlements.modResults['aps-environment'];
    return configWithEntitlements;
  });
};
