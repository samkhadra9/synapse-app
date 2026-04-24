/**
 * @bacons/apple-targets config for the Home Screen widget.
 *
 * This declares a SwiftUI widget extension target named "AiteallWidget"
 * scoped to the same App Group as the main app so both processes can
 * read / write the shared UserDefaults suite.
 *
 * Docs: https://github.com/EvanBacon/expo-apple-targets
 */
module.exports = {
  type: 'widget',
  name: 'AiteallWidget',
  bundleIdentifier: 'com.synapseadhd.app.widget',
  icon: '../../assets/icon.png',
  deploymentTarget: '16.4', // widgetURL on iOS 14+, Live Activity 16.1+, TimelineView pipelined stuff 16.4+
  entitlements: {
    'com.apple.security.application-groups': [
      'group.com.synapseadhd.app',
    ],
  },
};
