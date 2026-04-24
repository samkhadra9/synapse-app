/**
 * @bacons/apple-targets config for the Share Extension.
 *
 * Registers under the iOS share sheet as "Send to Aiteall". When the
 * user picks it, the extension reads whatever was shared (text / URL /
 * selected text from Safari) and opens the main app with the payload
 * as the first user message in a dump-mode chat.
 *
 * App Group membership is required — we write the seed to the shared
 * UserDefaults suite so the main app can consume it even if the
 * deep-link URL is truncated (iOS caps widget/extension URL length).
 */
module.exports = {
  type: 'share',
  name: 'AiteallShare',
  bundleIdentifier: 'com.synapseadhd.app.share',
  icon: '../../assets/icon.png',
  deploymentTarget: '16.4',
  entitlements: {
    'com.apple.security.application-groups': [
      'group.com.synapseadhd.app',
    ],
  },
  // These drive Info.plist NSExtension → NSExtensionAttributes →
  // NSExtensionActivationRule. Accept text, URLs, and plain-text files.
  // Images skipped for this first pass (would need UIImage serialisation
  // + a separate storage path in App Group).
  infoPlist: {
    CFBundleDisplayName: 'Send to Aiteall',
    NSExtension: {
      NSExtensionAttributes: {
        NSExtensionActivationRule: {
          NSExtensionActivationSupportsText: true,
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1,
        },
      },
      NSExtensionPointIdentifier: 'com.apple.share-services',
      NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).ShareViewController',
    },
  },
};
